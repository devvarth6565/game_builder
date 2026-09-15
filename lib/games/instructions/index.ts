import type { SystemModelMessage } from "ai"

import { runtimeInstructions } from "@/lib/games/instructions/runtime"
import { workflowInstructions } from "@/lib/games/instructions/workflow"

export const gameInstructions: SystemModelMessage[] = [
  workflowInstructions,
  runtimeInstructions,
]
