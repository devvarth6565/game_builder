"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs"
import { CoinsIcon, MessageSquareIcon, PlusIcon } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function AppSidebar({
  games,
}: {
  games: { id: string; title: string }[]
}) {
  const pathname = usePathname()
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center justify-between gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
              <Image src="/logo.svg" alt="Logo" width={20} height={20} className="size-5" />
              <span className="font-logo text-base">Game builder</span>
            </div>
            <SidebarTrigger />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/"}
                  render={<Link href="/" />}
                >
                  <PlusIcon />
                  <span>New Game</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {isCollapsed ? (
            <Popover>
              <PopoverTrigger
                render={
                  <SidebarMenuButton tooltip="Recents">
                    <MessageSquareIcon />
                    <span>Recents</span>
                  </SidebarMenuButton>
                }
              />
              <PopoverContent side="right" align="start">
                <RecentsMenu games={games} pathname={pathname} />
              </PopoverContent>
            </Popover>
          ) : (
            <>
              <SidebarGroupLabel>Recents</SidebarGroupLabel>
              <SidebarGroupContent>
                <RecentsMenu games={games} pathname={pathname} />
              </SidebarGroupContent>
            </>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <CoinsIcon className="hidden group-data-[collapsible=icon]:block" />
              <span>Credits</span>
            </SidebarMenuButton>
            <SidebarMenuBadge>128</SidebarMenuBadge>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center gap-3 px-2 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="min-w-0 flex-1 overflow-hidden group-data-[collapsible=icon]:hidden">
            <OrganizationSwitcher
              appearance={{
                elements: {
                  rootBox: "w-full! max-w-full",
                  organizationSwitcherTrigger:
                    "w-full! max-w-full justify-between!",
                  organizationPreview: "min-w-0",
                  organizationPreviewTextContainer: "min-w-0",
                  organizationPreviewMainIdentifier: "truncate",
                },
              }}
            />
          </div>
          <UserButton />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function RecentsMenu({
  games,
  pathname,
}: {
  games: { id: string; title: string }[]
  pathname: string
}) {
  return (
    <SidebarMenu>
      {games.length === 0 ? (
        <SidebarMenuItem>
          <SidebarMenuButton disabled>
            <MessageSquareIcon />
            <span>No recent games yet.</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : (
        games.map((game) => (
          <SidebarMenuItem key={game.id}>
            <SidebarMenuButton
              isActive={pathname === `/games/${game.id}`}
              render={<Link href={`/games/${game.id}`} />}
            >
              <MessageSquareIcon />
              <span>{game.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))
      )}
    </SidebarMenu>
  )
}
