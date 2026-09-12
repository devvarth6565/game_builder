import Image from "next/image"
import { auth } from "@clerk/nextjs/server"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { ChatComposer } from "@/components/chat-composer"
import { suggestions } from "@/lib/game/suggestions"

export default async function Page() {
  await auth.protect({unauthenticatedUrl:"/sign-in"})

  return (
    <div className="flex min-h-svh flex-col">
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia>
            <Image src="/logo.svg" alt="Logo" width={48} height={48} />
          </EmptyMedia>
          <EmptyTitle className="text-2xl">What should we build today?</EmptyTitle>
          <EmptyDescription>
            Build your own racers, shooters, puzzles and whole worlds using your
            own words. If you can describe it, you can play it.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-2xl gap-6">
          <ChatComposer />
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map(({ label, icon: Icon }) => (
              <Button
                key={label}
                variant="outline"
                size="sm"
                className="rounded-full"
              >
                <Icon />
                {label}
              </Button>
            ))}
          </div>
        </EmptyContent>
      </Empty>
    </div>
  )
}
