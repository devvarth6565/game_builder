"use client"

import { useCallback, useState, type ComponentProps } from "react"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ChatPreview } from "@/components/chat-preview"
import { ChatThread } from "@/components/chat-thread"

export function GameChat({
  hasSandbox,
  ...props
}: Omit<ComponentProps<typeof ChatThread>, "onGameChanged"> & {
  hasSandbox: boolean
}) {
  // Bumped every time a turn changes the game, and handed to the preview as
  // its remount key. The preview URL itself never changes, so this counter is
  // the only thing that tells the iframe to go and fetch the new build.
  const [revision, setRevision] = useState(0)

  // A game is created with no sandbox and redirected to straight away, so the
  // first render of a new game always says there is nothing to preview; the
  // sandbox appears only once the agent's run starts, which no longer
  // re-renders the server component. Without this the panel would stay hidden
  // for the whole session that built the game, until a manual reload. The
  // revision signal is raised after a turn wrote to the game directory, so by
  // the time it arrives the sandbox is guaranteed to exist.
  const [hasPreview, setHasPreview] = useState(hasSandbox)

  const handleGameChanged = useCallback(() => {
    setHasPreview(true)
    setRevision((current) => current + 1)
  }, [])

  return (
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel id="chat" defaultSize="50" minSize="25">
        <ChatThread {...props} onGameChanged={handleGameChanged} />
      </ResizablePanel>
      {hasPreview && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel id="preview" defaultSize="50" minSize="25">
            <ChatPreview gameId={props.id} revision={revision} />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  )
}
