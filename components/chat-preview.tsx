"use client"

import { RotateCw } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"

export function ChatPreview({
  gameId,
  revision = 0,
}: {
  gameId: string
  /** Bumped by GameChat when a turn changes the game. */
  revision?: number
}) {
  const [manualReloads, setManualReloads] = useState(0)
  const [loadedVersion, setLoadedVersion] = useState<string>()

  // The build and the reload button are two independent reasons to refetch, so
  // the iframe is keyed on both rather than on either one alone.
  const version = `${revision}.${manualReloads}`

  // Derived rather than an effect: whatever last finished loading either is
  // the version being shown or it isn't, and a new build makes it stale on the
  // same render that changes the key.
  const loading = loadedVersion !== version

  return (
    <div className="relative size-full">
      <iframe
        // Remounting on `version` is what forces the refetch: the URL is
        // otherwise identical from one build to the next, so React would keep
        // the existing iframe and the player would go on seeing the old game.
        // The matching query string keeps any intermediary from answering the
        // new request out of its cache.
        key={version}
        // Served through our own origin so the proxy can send Daytona's
        // skip-warning header. Points at index.html rather than a trailing
        // slash (which Next redirects away) so the game's relative references
        // like "./game.js" resolve back into this route.
        src={`/api/games/${gameId}/preview/index.html?v=${version}`}
        title="Game preview"
        className="size-full border-0"
        onLoad={() => setLoadedVersion(version)}
      />

      {loading && (
        <p className="absolute inset-0 grid place-items-center bg-background text-muted-foreground">
          Starting preview…
        </p>
      )}

      <Button
        variant="secondary"
        size="icon"
        onClick={() => setManualReloads((count) => count + 1)}
        title="Reload preview"
        className="absolute top-2 right-2 opacity-70 hover:opacity-100"
      >
        <RotateCw />
      </Button>
    </div>
  )
}
