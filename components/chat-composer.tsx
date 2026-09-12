"use client"

import {
  ArrowUpIcon,
  BoxIcon,
  CarIcon,
  ChevronDownIcon,
  CrosshairIcon,
  Gamepad2Icon,
  Grid2x2Icon,
  PlaneIcon,
  SwordsIcon,
  ZapIcon,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Button } from "@/components/ui/button"

const suggestions = [
  { label: "Voxel survival", icon: BoxIcon },
  { label: "Ink samurai duel", icon: SwordsIcon },
  { label: "Comic-book firefight", icon: ZapIcon },
  { label: "Realistic battlefield", icon: PlaneIcon },
  { label: "Fight-first shooter", icon: CrosshairIcon },
  { label: "Jungle expedition drive", icon: CarIcon },
  { label: "Sunny kingdom platformer", icon: Gamepad2Icon },
]

export function ChatComposer() {
  return (
    <div className="flex w-full flex-col gap-4">
      <InputGroup>
        <InputGroupTextarea placeholder="Describe the game you want to build…" />
        <InputGroupAddon align="block-end" className="justify-between">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <InputGroupButton>
                  <Grid2x2Icon />
                  Kimi K3
                  <ChevronDownIcon />
                </InputGroupButton>
              }
            />
            <DropdownMenuContent>
              <DropdownMenuItem>Kimi K3</DropdownMenuItem>
              <DropdownMenuItem>GPT-5</DropdownMenuItem>
              <DropdownMenuItem>Claude</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <InputGroupButton
            type="submit"
            variant="default"
            size="icon-sm"
            className="rounded-full"
          >
            <ArrowUpIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>

      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map(({ label, icon: Icon }) => (
          <Button key={label} variant="outline" size="sm" className="rounded-full">
            <Icon />
            {label}
          </Button>
        ))}
      </div>
    </div>
  )
}
