import { groq } from "@ai-sdk/groq"
import { chat, upsertIncomingMessage } from "@trigger.dev/sdk/ai"
import {
  createIdGenerator,
  stepCountIs,
  streamText,
  validateUIMessages,
} from "ai"
import { eq } from "drizzle-orm"

import { createGameSandbox } from "@/lib/daytona/utils"
import { db } from "@/lib/db"
import { games } from "@/lib/db/schema"
import { gameInstructions } from "@/lib/games/instructions"
import { createGameTools } from "@/lib/games/tools"

export const gameChat = chat.agent({
  id: "game-chat",
  // A chat is a game, so the chat id is the game id. Resolved per turn, which
  // keeps the sandbox lookup inside the turn that uses it.
  tools: ({ chatId }) => createGameTools(chatId),
  uiMessageStreamOptions: {
    generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
  },
  // Fires once per chat, on its first message.
  onChatStart: async ({ chatId }) => {
    await createGameSandbox(chatId)
  },
  // The games table is the source of truth for the thread. Access to a chat
  // is authorized when its session token is minted (lib/games/chat-actions.ts).
  hydrateMessages: async ({ chatId, trigger, incomingMessages }) => {
    const [game] = await db
      .select({ messages: games.messages })
      .from(games)
      .where(eq(games.id, chatId))
    if (!game) {
      throw new Error(`Game ${chatId} not found`)
    }

    const stored = game.messages

    if (upsertIncomingMessage(stored, { trigger, incomingMessages })) {
      await db
        .update(games)
        .set({ messages: stored, updatedAt: new Date() })
        .where(eq(games.id, chatId))
    }

    // Regenerating replies to the stored thread without its trailing answer.
    if (trigger === "regenerate-message") {
      while (stored.length > 0 && stored.at(-1)?.role !== "user") {
        stored.pop()
      }
    }

    return validateUIMessages({ messages: stored })
  },
  // One UPDATE writes the thread and the resume cursor atomically.
  onTurnComplete: async ({
    chatId,
    uiMessages,
    chatAccessToken,
    lastEventId,
  }) => {
    await db
      .update(games)
      .set({
        messages: uiMessages,
        chatAccessToken,
        lastEventId,
        updatedAt: new Date(),
      })
      .where(eq(games.id, chatId))
  },
  run: async ({ messages, tools, signal }) =>
    streamText({
      ...chat.toStreamTextOptions({ tools }),
      // 120b over 20b for the build loop: ~33k max output tokens, so a whole
      // game fits in one write_file call without truncating.
      model: groq("openai/gpt-oss-120b"),
      instructions: gameInstructions,
      messages,
      abortSignal: signal,
      // Building a game takes a read/write/verify loop, not a single call.
      stopWhen: stepCountIs(25),
    }),
})
