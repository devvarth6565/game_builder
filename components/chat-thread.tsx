"use client"

import Image from "next/image"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"

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

export function ChatThread() {
  const { messages, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  })

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
