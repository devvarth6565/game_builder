"use client"

import { ArrowUpIcon, ChevronDownIcon, Grid2x2Icon } from "lucide-react"

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
import { createGame } from "@/lib/games/actions"

export function ChatComposer() {
  return (
    <div className="flex w-full flex-col gap-4">
      <form action={createGame}>
        <InputGroup>
          <InputGroupTextarea
            name="title"
            required
            placeholder="Describe the game you want to build…"
          />
          <InputGroupAddon align="block-end" className="justify-between">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <InputGroupButton type="button">
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
      </form>
    </div>
  )
}
