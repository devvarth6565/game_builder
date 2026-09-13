"use server"

import { auth } from "@clerk/nextjs/server"
import { groq } from "@ai-sdk/groq"
import { createIdGenerator, generateText } from "ai"
import { redirect } from "next/navigation"

import { db } from "@/lib/db"
import { games } from "@/lib/db/schema"

export async function createGame(prompt: string) {
  const { orgId } = await auth.protect()
  if (!orgId) {
    throw new Error("An organization must be selected to create a game.")
  }

  if (prompt.trim().length === 0) {
    throw new Error("Prompt is required.")
  }

  const { text } = await generateText({
    model: groq("openai/gpt-oss-20b"),
    reasoning: "low",
    instructions:
      "Write a short, catchy title (2-5 words) for the game the user describes. Reply with only the title, no quotes or punctuation at the end.",
    prompt: prompt.trim(),
  })

  const title = text.trim().replace(/^["']|["']$/g, "") || prompt.trim()

  // Store the prompt as the first message; the game page picks it up and
  // requests the assistant's reply.
  const [game] = await db
    .insert(games)
    .values({
      orgId,
      title,
      messages: [
        {
          id: createIdGenerator({ prefix: "msg", size: 16 })(),
          role: "user",
          parts: [{ type: "text", text: prompt.trim() }],
        },
      ],
    })
    .returning({ id: games.id })

  redirect(`/games/${game.id}`)
}
