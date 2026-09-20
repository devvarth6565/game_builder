"use client"

import { useCallback, useEffect } from "react"
import Image from "next/image"
import { useChat } from "@ai-sdk/react"
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import { getToolName, isToolUIPart } from "ai"
import type { DynamicToolUIPart, ToolUIPart, UIMessage } from "ai"
import { Check, LoaderCircle, TriangleAlert } from "lucide-react"
import { cn } from "cn"

import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller"
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message"
import { BubbleGroup, Bubble, BubbleContent } from "@/components/ui/bubble"
import { ChatComposer } from "@/components/chat-composer"
import { mintChatAccessToken, startChatSession } from "@/lib/games/chat-actions"
import type { gameChat } from "@/trigger/chat"

type AnyToolUIPart = ToolUIPart | DynamicToolUIPart

const TOOL_VERBS: Record<string, { active: string; settled: string }> = {
  write_file: { active: "Writing", settled: "Wrote" },
  replace_text: { active: "Editing", settled: "Edited" },
  read_file: { active: "Reading", settled: "Read" },
  list_files: { active: "Listing", settled: "Listed" },
  delete_file: { active: "Deleting", settled: "Deleted" },
}

const MAX_ERROR_LENGTH = 140

// The file tools report recoverable failures as an `error` field on an
// otherwise successful result (lib/games/tools.ts), so "the call returned" and
// "the call worked" are different questions. Ask both.
function toolErrorText(part: AnyToolUIPart) {
  if (part.state === "output-error") {
    return part.errorText
  }

  if (part.state === "output-available") {
    const { output } = part
    if (output && typeof output === "object" && "error" in output) {
      const error = (output as { error?: unknown }).error
      if (typeof error === "string") {
        return error
      }
    }
  }

  return undefined
}

// Every file tool takes a `path`, which is the useful half of the label.
function toolTarget(part: AnyToolUIPart) {
  const { input } = part
  if (input && typeof input === "object" && "path" in input) {
    const target = (input as { path?: unknown }).path
    if (typeof target === "string" && target) {
      return target
    }
  }
  return undefined
}

function ToolMarker({ part }: { part: AnyToolUIPart }) {
  const name = getToolName(part)
  const error = toolErrorText(part)

  const status =
    error !== undefined || part.state === "output-denied"
      ? "failed"
      : part.state === "output-available"
        ? "done"
        : "active"

  const verbs = TOOL_VERBS[name]
  const verb = verbs
    ? verbs[status === "active" ? "active" : "settled"]
    : name.replace(/_/g, " ")

  const target = toolTarget(part)

  return (
    <Marker className={cn("px-3", status === "failed" && "text-destructive")}>
      <MarkerIcon>
        {status === "active" ? (
          <LoaderCircle className="animate-spin" />
        ) : status === "failed" ? (
          <TriangleAlert />
        ) : (
          <Check />
        )}
      </MarkerIcon>
      <MarkerContent>
        {target ? `${verb} ${target}` : verb}
        {status === "failed" && error && (
          <span className="opacity-80">
            {" — "}
            {error.length > MAX_ERROR_LENGTH
              ? `${error.slice(0, MAX_ERROR_LENGTH)}…`
              : error}
          </span>
        )}
      </MarkerContent>
    </Marker>
  )
}

export function ChatThread({
  id,
  initialMessages,
  session,
  onGameChanged,
}: {
  id: string
  initialMessages: UIMessage[]
  session?: { publicAccessToken: string; lastEventId?: string }
  /** Called when a turn ends having changed the game (see trigger/chat.ts). */
  onGameChanged?: () => void
}) {
  // The agent loads the stored thread, so the transport only sends the new
  // message and resumes an in-flight reply from the stored cursor.
  const transport = useTriggerChatTransport<typeof gameChat>({
    task: "game-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
    sessions: session ? { [id]: session } : undefined,
  })

  const { messages, sendMessage, regenerate, stop, status } = useChat({
    id,
    messages: initialMessages,
    transport,
    resume: session !== undefined,
    // The agent writes this transient part once a turn has touched the game
    // directory. It never lands in `messages`, so it has to be read here.
    onData: (part) => {
      if (part.type === "data-preview-revision") {
        onGameChanged?.()
      }
    },
  })

  const isGenerating = status === "submitted" || status === "streaming"

  // `stop()` alone doesn't reach the agent for a resumed stream, so the
  // transport signals the run directly; `stop()` then settles the UI state.
  const handleStop = useCallback(() => {
    void transport.stopGeneration(id)
    stop()
  }, [transport, id, stop])

  // A new game starts with the prompt as an unanswered user message. The
  // request is deferred so a Strict Mode remount (which stops the chat)
  // cancels the timer instead of aborting an in-flight request. Once a
  // session exists the reply is already underway, and `resume` picks it up.
  useEffect(() => {
    if (initialMessages.at(-1)?.role !== "user" || session) return

    const timeout = setTimeout(() => regenerate())
    return () => clearTimeout(timeout)
  }, [initialMessages, session, regenerate])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MessageScrollerProvider>
        {/* `h-auto` undoes the primitive's `size-full`: a 100% height next to
            the composer would sum past the column and overflow it. `flex-1`
            with `min-h-0` is what confines scrolling to the viewport inside. */}
        <MessageScroller className="h-auto min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-2xl px-4 py-6">
              {messages.map((message) => {
                const align = message.role === "user" ? "end" : "start"

                return (
                  <MessageScrollerItem key={message.id}>
                    <Message align={align}>
                      {message.role === "assistant" && (
                        <MessageAvatar>
                          <Image
                            src="/logo.svg"
                            alt="Assistant"
                            width={32}
                            height={32}
                          />
                        </MessageAvatar>
                      )}
                      <MessageContent>
                        <BubbleGroup>
                          <Bubble
                            align={align}
                            variant={
                              message.role === "user" ? "secondary" : "ghost"
                            }
                          >
                            {message.parts.map((part, index) => {
                              if (part.type === "text") {
                                return (
                                  <BubbleContent key={index}>
                                    {part.text}
                                  </BubbleContent>
                                )
                              }

                              if (isToolUIPart(part)) {
                                return (
                                  <ToolMarker
                                    key={part.toolCallId ?? index}
                                    part={part}
                                  />
                                )
                              }

                              return null
                            })}
                          </Bubble>
                        </BubbleGroup>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                )
              })}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <div className="mx-auto w-full max-w-2xl shrink-0 px-4 pb-4">
        <ChatComposer
          onSubmit={(text) => sendMessage({ text })}
          onStop={handleStop}
          isGenerating={isGenerating}
        />
      </div>
    </div>
  )
}
