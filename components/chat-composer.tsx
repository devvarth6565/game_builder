"use client"

import { useState } from "react"

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

export function ChatComposer({
  onSubmit,
}: {
  onSubmit: (message: string) => void | Promise<void>
}) {
  const [value, setValue] = useState("")

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const message = value.trim()
    if (!message) return

    setValue("")
    onSubmit(message)
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <form onSubmit={handleSubmit}>
        <InputGroup>
          <InputGroupTextarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
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
