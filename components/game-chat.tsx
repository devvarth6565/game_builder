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
  const handleGameChanged = useCallback(
    () => setRevision((current) => current + 1),
    []
  )

  return (
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel id="chat" defaultSize="50" minSize="25">
        <ChatThread {...props} onGameChanged={handleGameChanged} />
      </ResizablePanel>
      {hasSandbox && (
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
