"use client"

import { useEffect } from "react"
import Image from "next/image"
import { useChat } from "@ai-sdk/react"
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import type { UIMessage } from "ai"

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
import {
  mintChatAccessToken,
  startChatSession,
} from "@/lib/games/chat-actions"
import type { gameChat } from "@/trigger/chat"

export function ChatThread({
  id,
  initialMessages,
  session,
}: {
  id: string
  initialMessages: UIMessage[]
  session?: { publicAccessToken: string; lastEventId?: string }
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

  const { messages, sendMessage, regenerate } = useChat({
    id,
    messages: initialMessages,
    transport,
    resume: session !== undefined,
  })

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
        <MessageScroller className="flex-1">
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
                            {message.parts.map((part, index) =>
                              part.type === "text" ? (
                                <BubbleContent key={index}>
                                  {part.text}
                                </BubbleContent>
                              ) : null
                            )}
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

      <div className="mx-auto w-full max-w-2xl px-4 pb-4">
        <ChatComposer onSubmit={(text) => sendMessage({ text })} />
      </div>
    </div>
  )
}
