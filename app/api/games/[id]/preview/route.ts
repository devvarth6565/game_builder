import { GAME_SERVER_PORT, startGameServer } from "@/lib/daytona/utils"
import { getGame } from "@/lib/games/queries"

const PREVIEW_URL_TTL_SECONDS = 3600

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const game = await getGame(id)

  if (!game?.sandboxId) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  const { sandbox } = await startGameServer(game.sandboxId)
  const preview = await sandbox.getSignedPreviewUrl(
    GAME_SERVER_PORT,
    PREVIEW_URL_TTL_SECONDS
  )

  return Response.json({ url: preview.url })
}
