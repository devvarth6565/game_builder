import { notFound } from "next/navigation"

import { ChatThread } from "@/components/chat-thread"
import { getGame } from "@/lib/games/queries"

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const game = await getGame(id)

  if (!game) {
    notFound()
  }

  return (
    <div className="flex h-svh flex-col">
      <p className="shrink-0 p-4">{game.title}</p>
      <div className="min-h-0 flex-1">
        <ChatThread id={game.id} initialMessages={game.messages} />
      </div>
    </div>
  )
}
