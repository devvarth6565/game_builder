import Image from "next/image"

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

const mockMessages = [
  {
    id: "1",
    role: "user",
    content: "I want to build a voxel survival game set on a floating island.",
  },
  {
    id: "2",
    role: "assistant",
    content:
      "Great idea! Let's start with the terrain generation and a basic block-placing system.",
  },
  {
    id: "3",
    role: "user",
    content: "Can we add a day/night cycle and simple hunger mechanics too?",
  },
  {
    id: "4",
    role: "assistant",
    content:
      "Absolutely — I'll wire up a day/night cycle first, then layer in a hunger system tied to player health.",
  },
] as const

export function ChatThread() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <MessageScrollerProvider>
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-2xl px-4 py-6">
              {mockMessages.map((message) => {
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
                            <BubbleContent>{message.content}</BubbleContent>
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
        <ChatComposer />
      </div>
    </div>
  )
}
