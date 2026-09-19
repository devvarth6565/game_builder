"use client"

import { RotateCw } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"

export function ChatPreview({ gameId }: { gameId: string }) {
  const [reloadKey, setReloadKey] = useState(0)
  const [loading, setLoading] = useState(true)

  const reload = () => {
    setLoading(true)
    setReloadKey((key) => key + 1)
  }

  return (
    <div className="relative size-full">
      <iframe
        key={reloadKey}
        // Served through our own origin so the proxy can send Daytona's
        // skip-warning header. Points at index.html rather than a trailing
        // slash (which Next redirects away) so the game's relative references
        // like "./game.js" resolve back into this route.
        src={`/api/games/${gameId}/preview/index.html`}
        title="Game preview"
        className="size-full border-0"
        onLoad={() => setLoading(false)}
      />

      {loading && (
        <p className="absolute inset-0 grid place-items-center bg-background text-muted-foreground">
          Starting preview…
        </p>
      )}

      <Button
        variant="secondary"
        size="icon"
        onClick={reload}
        title="Reload preview"
        className="absolute top-2 right-2 opacity-70 hover:opacity-100"
      >
        <RotateCw />
      </Button>
    </div>
  )
}
