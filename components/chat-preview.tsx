"use client"

import { useEffect, useState } from "react"

export function ChatPreview({ gameId }: { gameId: string }) {
  const [url, setUrl] = useState<string>()
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch(`/api/games/${gameId}/preview`)
      .then((res) => {
        if (!res.ok) throw new Error(`Preview request failed: ${res.status}`)
        return res.json() as Promise<{ url: string }>
      })
      .then((data) => {
        if (!cancelled) setUrl(data.url)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
  }, [gameId])

  if (error) {
    return <p className="p-4 text-muted-foreground">Preview unavailable</p>
  }

  if (!url) {
    return <p className="p-4 text-muted-foreground">Starting preview…</p>
  }

  return <iframe src={url} title="Game preview" className="size-full border-0" />
}
