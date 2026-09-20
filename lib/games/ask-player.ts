import { tool } from "ai"
import { z } from "zod"

// The parts of a game that are worth a question. The model picks one before it
// writes the question, so the question lands on a single design decision
// instead of asking about the whole game at once.
export const ASK_PLAYER_DIMENSIONS = [
  "loop",
  "goal",
  "world",
  "look",
  "feel",
  "controls",
  "scope",
] as const

export const askPlayerOutputSchema = z.object({
  id: z.string().describe("The id of the option the player chose."),
  label: z.string().describe("The label of the option the player chose."),
})

export type AskPlayerOutput = z.infer<typeof askPlayerOutputSchema>

/**
 * Asks the player to choose between a few directions for the game.
 *
 * Unlike the file tools this one has no `execute`: the turn ends with the call
 * pending, the player answers it in the UI, and the next turn resumes from
 * their choice. Because nothing on the server produces the result, the shape
 * the UI sends back is declared here as `outputSchema`.
 */
export const askPlayer = tool({
  description: `Ask the player to choose between a few directions for the game, and wait for their answer before building. Use it only when the request is genuinely ambiguous in a way that would waste a whole build if you guessed wrong; otherwise pick sensible defaults, say what you picked, and build. Ask about one thing at a time, and never ask a question the player already answered.`,
  inputSchema: z.object({
    // First in the schema so the model commits to an area before it writes the
    // question, which keeps the options comparable to each other.
    dimension: z
      .enum(ASK_PLAYER_DIMENSIONS)
      .describe(
        `Which part of the game the question is about. "loop" is the moment-to-moment action and what the player does every few seconds; "goal" is how they win, lose, score or progress; "world" is the setting, theme and how levels are laid out; "look" is art style, palette, camera and perspective; "feel" is pacing, difficulty and mood; "controls" is the input scheme; "scope" is which feature to build, cut or do next.`
      ),
    question: z
      .string()
      .describe(
        'One short question about that dimension, addressed to the player, e.g. "How should the platformer handle falling?" Ask about the game, not about implementation.'
      ),
    options: z
      .array(
        z.object({
          id: z
            .string()
            .describe(
              'Short stable identifier for the option, lowercase with dashes, e.g. "instant-respawn".'
            ),
          label: z
            .string()
            .describe(
              'A few words naming the option, shown on the button the player clicks, e.g. "Instant respawn".'
            ),
          description: z
            .string()
            .describe(
              "One sentence on what choosing this means for the game the player will play."
            ),
        })
      )
      .min(2)
      .max(4)
      .describe(
        "The choices, 2 to 4 of them. They must be meaningfully different from each other and all of them buildable."
      ),
  }),
  // No execute: the player answers in the UI, and their choice comes back as
  // the tool output on the next turn.
  outputSchema: askPlayerOutputSchema,
})
