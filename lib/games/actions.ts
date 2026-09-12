"use server"

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"

import { db } from "@/lib/db"
import { games } from "@/lib/db/schema"

export async function createGame(title: string) {
  const { orgId } = await auth.protect()
  if (!orgId) {
    throw new Error("An organization must be selected to create a game.")
  }

  if (title.trim().length === 0) {
    throw new Error("Title is required.")
  }

  const [game] = await db
    .insert(games)
    .values({ orgId, title: title.trim() })
    .returning({ id: games.id })

  redirect(`/games/${game.id}`)
}
