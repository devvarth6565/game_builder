import { notFound } from "next/navigation"

import { GameChat } from "@/components/game-chat"
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
        <GameChat
          id={game.id}
          hasSandbox={Boolean(game.sandboxId)}
          initialMessages={game.messages}
          session={
            game.chatAccessToken
              ? {
                  publicAccessToken: game.chatAccessToken,
                  lastEventId: game.lastEventId ?? undefined,
                }
              : undefined
          }
        />
      </div>
    </div>
  )
}
