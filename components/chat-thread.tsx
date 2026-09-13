"use client"

import { useEffect } from "react"
import Image from "next/image"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"

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

export function ChatThread({
  id,
  initialMessages,
}: {
  id: string
  initialMessages: UIMessage[]
}) {
  const { messages, sendMessage, regenerate } = useChat({
    id,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      // The server loads the stored thread, so only send the new message.
      // Regenerating replies to the stored thread as-is.
      prepareSendMessagesRequest({ id, messages, trigger }) {
        return {
          body:
            trigger === "submit-message"
              ? { id, message: messages[messages.length - 1] }
              : { id },
        }
      },
    }),
  })

  // A new game starts with the prompt as an unanswered user message. The
  // request is deferred so a Strict Mode remount (which stops the chat)
  // cancels the timer instead of aborting an in-flight request.
  useEffect(() => {
    if (initialMessages.at(-1)?.role !== "user") return

    const timeout = setTimeout(() => regenerate())
    return () => clearTimeout(timeout)
  }, [initialMessages, regenerate])

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
