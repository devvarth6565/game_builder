"use server"

import { auth } from "@clerk/nextjs/server"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import { chat } from "@trigger.dev/sdk/ai"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { games } from "@/lib/db/schema"
import { getGame } from "@/lib/games/queries"
import type { gameChat } from "@/trigger/chat"

const startSession = chat.createStartSessionAction<typeof gameChat>("game-chat")

// A chat is a game; only members of the game's organization may use it.
async function authorizeChat(chatId: string) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) {
    throw new Error("Unauthorized")
  }

  const game = await getGame(chatId)
  if (!game) {
    throw new Error("Not found")
  }
}

export async function startChatSession(
  params: Parameters<typeof startSession>[0]
) {
  await authorizeChat(params.chatId)

  const session = await startSession(params)

  // Lets a reload hand the session back to the transport so it can resume.
  await db
    .update(games)
    .set({ chatAccessToken: session.publicAccessToken })
    .where(eq(games.id, params.chatId))

  return session
}

export async function mintChatAccessToken(chatId: string) {
  await authorizeChat(chatId)

  return triggerAuth.createPublicToken({
    scopes: {
      read: { sessions: chatId },
      write: { sessions: chatId },
    },
    expirationTime: "1h",
  })
}
