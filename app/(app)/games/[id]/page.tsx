import { ChatThread } from "@/components/chat-thread"

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="flex h-svh flex-col">
      <p className="shrink-0 p-4">{id}</p>
      <div className="min-h-0 flex-1">
        <ChatThread />
      </div>
    </div>
  )
}
