import { GAME_SERVER_PORT, startGameServer } from "@/lib/daytona/utils"
import { getGame } from "@/lib/games/queries"

const PREVIEW_URL_TTL_SECONDS = 3600
// Re-mint before expiry so a long-lived preview never serves a dead URL.
const REFRESH_MARGIN_MS = 5 * 60 * 1000

type CachedPreview = { base: string; expiresAt: number }

// Minting a signed URL and health-checking the game server are both round
// trips to the sandbox, and a single page load fetches the HTML plus every
// asset. Cache per sandbox so only the first request pays for them.
const previewCache = new Map<string, CachedPreview>()

async function previewBase(sandboxId: string) {
  const cached = previewCache.get(sandboxId)
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return cached.base
  }

  const { sandbox } = await startGameServer(sandboxId)
  const signed = await sandbox.getSignedPreviewUrl(
    GAME_SERVER_PORT,
    PREVIEW_URL_TTL_SECONDS
  )

  previewCache.set(sandboxId, {
    base: signed.url.endsWith("/") ? signed.url : `${signed.url}/`,
    expiresAt: Date.now() + PREVIEW_URL_TTL_SECONDS * 1000,
  })

  return previewCache.get(sandboxId)!.base
}

/**
 * Serves the game's sandbox through this origin.
 *
 * The iframe cannot point straight at the Daytona preview URL: Daytona answers
 * browser-like requests with an "are you sure" interstitial, and the only way
 * past it on our tier is the X-Daytona-Skip-Preview-Warning header, which an
 * <iframe src> cannot send. Fetching server-side lets us set it.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; path?: string[] }> }
) {
  const { id, path } = await params

  // Org-scoped, so a preview is only reachable by the game's organization.
  const game = await getGame(id)
  if (!game?.sandboxId) {
    return new Response("Not found", { status: 404 })
  }

  const base = await previewBase(game.sandboxId)
  // Next strips a trailing slash, so the iframe asks for ".../preview/index.html"
  // rather than ".../preview/". Bare hits on the route still serve the entry point.
  const target = new URL(path?.length ? path.join("/") : "index.html", base)
  target.search = new URL(request.url).search

  const upstream = await fetch(target, {
    headers: { "X-Daytona-Skip-Preview-Warning": "true" },
    cache: "no-store",
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "application/octet-stream",
      // The game changes every turn, so nothing here may be cached.
      "cache-control": "no-store",
    },
  })
}
