"use server"

import { auth } from "@clerk/nextjs/server"
import { refresh } from "next/cache"

import { db } from "@/lib/db"
import { games } from "@/lib/db/schema"

export async function createGame(formData: FormData) {
  const { orgId } = await auth.protect()
  if (!orgId) {
    throw new Error("An organization must be selected to create a game.")
  }

  const title = formData.get("title")
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error("Title is required.")
  }

  await db.insert(games).values({ orgId, title: title.trim() })

  refresh()
}
