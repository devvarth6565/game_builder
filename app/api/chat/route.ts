import { auth } from "@clerk/nextjs/server"
import { groq } from "@ai-sdk/groq"
import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type UIMessage,
} from "ai"
import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { games } from "@/lib/db/schema"
import { getGame } from "@/lib/games/queries"

export const maxDuration = 30

export async function POST(req: Request) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) {
    return new Response("Unauthorized", { status: 401 })
  }

  // Without a message, reply to the stored thread (e.g. a new game's prompt).
  const { id, message }: { id: string; message?: UIMessage } = await req.json()

  const game = await getGame(id)
  if (!game) {
    return new Response("Not found", { status: 404 })
  }

  const thread = message ? [...game.messages, message] : game.messages
  if (thread.at(-1)?.role !== "user") {
    return new Response("Nothing to reply to", { status: 400 })
  }

  const messages = await validateUIMessages({ messages: thread })

  const result = streamText({
    model: groq("openai/gpt-oss-20b"),
    instructions: "You are a helpful assistant.",
    messages: await convertToModelMessages(messages),
  })

  // Run to completion so the thread is saved even if the client disconnects.
  result.consumeStream()

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
      onEnd: async ({ messages }) => {
        await db
          .update(games)
          .set({ messages, updatedAt: new Date() })
          .where(and(eq(games.id, game.id), eq(games.orgId, orgId)))
      },
    }),
  })
}
