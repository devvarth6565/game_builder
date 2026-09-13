"use client"

import type { ComponentProps } from "react"

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
}: ComponentProps<typeof ChatThread> & { hasSandbox: boolean }) {
  return (
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel id="chat" defaultSize="50" minSize="25">
        <ChatThread {...props} />
      </ResizablePanel>
      {hasSandbox && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel id="preview" defaultSize="50" minSize="25">
            <ChatPreview gameId={props.id} />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  )
}
