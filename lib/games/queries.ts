import "server-only"

import { auth } from "@clerk/nextjs/server"
import { and, desc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { games } from "@/lib/db/schema"

export async function listGames() {
  const { orgId } = await auth()
  if (!orgId) {
    return []
  }

  return db
    .select({ id: games.id, title: games.title })
    .from(games)
    .where(eq(games.orgId, orgId))
    .orderBy(desc(games.createdAt))
}

export async function getGame(id: string) {
  const { orgId } = await auth()
  if (!orgId) {
    return null
  }

  const [game] = await db
    .select()
    .from(games)
    .where(and(eq(games.id, id), eq(games.orgId, orgId)))

  return game ?? null
}
