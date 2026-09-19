import { tool } from "ai"
import path from "node:path"
import { z } from "zod"

import { GAME_DIR, getGameSandbox } from "@/lib/daytona/utils"

// Guards against a runaway model filling the sandbox disk or the context window.
const MAX_WRITE_BYTES = 512 * 1024
const MAX_READ_BYTES = 128 * 1024
const MAX_LIST_ENTRIES = 300
const MAX_LIST_DEPTH = 5

class GameToolError extends Error {}

// Every path a tool touches is resolved against the game directory and must
// land inside it, so the model can never read or write the rest of the sandbox.
// Absolute paths are allowed only when they already point into the directory.
function resolveGamePath(input: string) {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new GameToolError("path must not be empty")
  }
  if (trimmed.includes("\0")) {
    throw new GameToolError("path must not contain null bytes")
  }

  const absolute = path.posix.resolve(GAME_DIR, trimmed)
  if (absolute !== GAME_DIR && !absolute.startsWith(`${GAME_DIR}/`)) {
    throw new GameToolError(
      `path "${trimmed}" is outside the game directory. Use paths relative to ${GAME_DIR}, such as "index.html" or "src/player.js".`
    )
  }

  return { absolute, relative: path.posix.relative(GAME_DIR, absolute) || "." }
}

function errorMessage(error: unknown) {
  if (error instanceof GameToolError) {
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}

// Tools report failures as data instead of throwing, so the model sees what
// went wrong mid-turn and can correct itself instead of losing the turn.
async function attempt<T>(run: () => Promise<T>) {
  try {
    return await run()
  } catch (error) {
    return { error: errorMessage(error) }
  }
}

type Sandbox = Awaited<ReturnType<typeof getGameSandbox>>["sandbox"]

const SYNTAX_CHECKED_EXTENSIONS = new Set([".js", ".mjs"])

/**
 * The file tools the game agent uses to build the game, all confined to the
 * game directory of that game's Daytona sandbox.
 *
 * Built per turn so the sandbox is looked up (and started, if it was stopped)
 * at most once no matter how many tool calls the turn makes.
 */
export function createGameTools(gameId: string) {
  let sandboxPromise: Promise<Sandbox> | undefined

  const getSandbox = async () => {
    if (!sandboxPromise) {
      sandboxPromise = getGameSandbox(gameId).then(({ sandbox }) => sandbox)
      // A failed lookup must not be cached, or every later call in the turn
      // replays the same error instead of retrying the sandbox.
      sandboxPromise.catch(() => {
        sandboxPromise = undefined
      })
    }
    return sandboxPromise
  }

  const fs = async () => (await getSandbox()).fs

  // A single unbalanced brace makes the whole module fail to parse, which the
  // player only ever sees as a blank preview. Parsing the file in the sandbox
  // turns that into something the model can notice and fix in the same turn,
  // instead of reporting success on a game that never ran.
  const syntaxErrorIn = async (absolute: string) => {
    if (!SYNTAX_CHECKED_EXTENSIONS.has(path.posix.extname(absolute))) {
      return undefined
    }

    const quoted = `'${absolute.replace(/'/g, `'\\''`)}'`
    const result = await (
      await getSandbox()
    ).process.executeCommand(`node --check ${quoted}`)

    // 127 is "node not installed" — that is not the game's fault, so stay quiet.
    if (result.exitCode === 0 || result.exitCode === 127) {
      return undefined
    }

    return (
      String(result.result ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(
          (line) =>
            line && !line.startsWith("at ") && !line.startsWith("Node.js v")
        )
        .slice(0, 4)
        .join(" ") || "the file does not parse as JavaScript"
    )
  }

  const readFileContent = async (absolute: string, relative: string) => {
    try {
      const buffer = await (await fs()).downloadFile(absolute)
      return buffer.toString("utf8")
    } catch (error) {
      throw new GameToolError(
        `could not read "${relative}": ${errorMessage(error)}. Use list_files to see what exists.`
      )
    }
  }

  return {
    write_file: tool({
      description: `Create or overwrite a file in the game directory. Writes the whole file, so pass the complete contents. Parent directories are created as needed. Use replace_text instead for small edits to a large file.`,
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            'Path relative to the game directory, e.g. "index.html" or "src/player.js".'
          ),
        content: z
          .string()
          .describe("Full contents of the file. Replaces any existing file."),
      }),
      execute: async ({ path: input, content }) =>
        attempt(async () => {
          const { absolute, relative } = resolveGamePath(input)
          if (relative === ".") {
            throw new GameToolError(
              "path must be a file, not the game directory itself"
            )
          }

          const buffer = Buffer.from(content, "utf8")
          if (buffer.byteLength > MAX_WRITE_BYTES) {
            throw new GameToolError(
              `file is ${buffer.byteLength} bytes, over the ${MAX_WRITE_BYTES} byte limit. Split the game across several smaller files.`
            )
          }

          const directory = path.posix.dirname(absolute)
          if (directory !== GAME_DIR) {
            await (await fs()).createFolder(directory, "755").catch(() => {
              // Already exists, or upload will surface the real problem.
            })
          }

          await (await fs()).uploadFile(buffer, absolute)

          const syntaxError = await syntaxErrorIn(absolute)

          return {
            path: relative,
            bytes: buffer.byteLength,
            ...(syntaxError && {
              error: `Written, but "${relative}" does not parse and the game will not run: ${syntaxError} Fix it before you reply to the user.`,
            }),
          }
        }),
    }),

    replace_text: tool({
      description: `Replace an exact piece of text in a file in the game directory. Prefer this over write_file for targeted edits. Read the file first: old_text must match the file exactly, including indentation and line breaks.`,
      inputSchema: z.object({
        path: z
          .string()
          .describe('Path relative to the game directory, e.g. "src/game.js".'),
        old_text: z
          .string()
          .describe(
            "Exact text to replace. Include enough surrounding lines to make it unique unless replace_all is true."
          ),
        new_text: z
          .string()
          .describe("Text to put in its place. Empty string deletes old_text."),
        replace_all: z
          .boolean()
          .optional()
          .describe(
            "Replace every occurrence instead of requiring exactly one. Defaults to false."
          ),
      }),
      execute: async ({
        path: input,
        old_text,
        new_text,
        replace_all = false,
      }) =>
        attempt(async () => {
          const { absolute, relative } = resolveGamePath(input)
          if (!old_text) {
            throw new GameToolError("old_text must not be empty")
          }

          const content = await readFileContent(absolute, relative)
          const occurrences = content.split(old_text).length - 1

          if (occurrences === 0) {
            throw new GameToolError(
              `old_text was not found in "${relative}". Read the file and copy the text exactly as it appears.`
            )
          }
          if (occurrences > 1 && !replace_all) {
            throw new GameToolError(
              `old_text appears ${occurrences} times in "${relative}". Add surrounding lines to make it unique, or set replace_all to true.`
            )
          }

          // Spliced rather than replaced: String.replace would treat "$&" and
          // friends in new_text as substitution patterns.
          const pieces = content.split(old_text)
          const updated = replace_all
            ? pieces.join(new_text)
            : pieces[0] + new_text + pieces.slice(1).join(old_text)

          const buffer = Buffer.from(updated, "utf8")
          if (buffer.byteLength > MAX_WRITE_BYTES) {
            throw new GameToolError(
              `the edit would make "${relative}" ${buffer.byteLength} bytes, over the ${MAX_WRITE_BYTES} byte limit.`
            )
          }

          await (await fs()).uploadFile(buffer, absolute)

          const syntaxError = await syntaxErrorIn(absolute)

          return {
            path: relative,
            replacements: replace_all ? occurrences : 1,
            bytes: buffer.byteLength,
            ...(syntaxError && {
              error: `Edit applied, but "${relative}" no longer parses and the game will not run: ${syntaxError} Fix it before you reply to the user.`,
            }),
          }
        }),
    }),

    read_file: tool({
      description: `Read a file from the game directory. Use it before editing a file you did not write this turn.`,
      inputSchema: z.object({
        path: z
          .string()
          .describe('Path relative to the game directory, e.g. "index.html".'),
      }),
      execute: async ({ path: input }) =>
        attempt(async () => {
          const { absolute, relative } = resolveGamePath(input)
          const content = await readFileContent(absolute, relative)

          const truncated = content.length > MAX_READ_BYTES
          return {
            path: relative,
            content: truncated ? content.slice(0, MAX_READ_BYTES) : content,
            truncated,
          }
        }),
    }),

    list_files: tool({
      description: `List the files and directories in the game directory. Use it at the start of a follow-up turn to see what the game already contains.`,
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe(
            'Directory relative to the game directory. Defaults to "." (the game directory itself).'
          ),
        depth: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIST_DEPTH)
          .optional()
          .describe(
            `How many levels deep to list. 1 (the default) lists only direct entries, up to ${MAX_LIST_DEPTH}.`
          ),
      }),
      execute: async ({ path: input = ".", depth = 1 }) =>
        attempt(async () => {
          const { absolute, relative } = resolveGamePath(input)

          let entries
          try {
            entries = await (await fs()).listFiles(absolute, { depth })
          } catch (error) {
            throw new GameToolError(
              `could not list "${relative}": ${errorMessage(error)}`
            )
          }

          const listed = entries
            .map((entry) => ({
              path: path.posix.relative(
                GAME_DIR,
                entry.path ?? path.posix.join(absolute, entry.name)
              ),
              type: entry.isDir ? ("directory" as const) : ("file" as const),
              size: entry.isDir ? undefined : entry.size,
            }))
            .sort((a, b) => a.path.localeCompare(b.path))

          return {
            path: relative,
            entries: listed.slice(0, MAX_LIST_ENTRIES),
            truncated: listed.length > MAX_LIST_ENTRIES,
          }
        }),
    }),

    delete_file: tool({
      description: `Delete a file, or a directory and everything in it, from the game directory. Only delete files the game no longer uses; never leave the game unable to load.`,
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            'Path relative to the game directory, e.g. "src/old-level.js".'
          ),
        recursive: z
          .boolean()
          .optional()
          .describe(
            "Required to delete a directory along with its contents. Defaults to false."
          ),
      }),
      execute: async ({ path: input, recursive = false }) =>
        attempt(async () => {
          const { absolute, relative } = resolveGamePath(input)
          if (relative === ".") {
            throw new GameToolError(
              "the game directory itself cannot be deleted"
            )
          }

          let isDirectory = false
          try {
            isDirectory = (await (await fs()).getFileDetails(absolute)).isDir
          } catch (error) {
            throw new GameToolError(
              `could not find "${relative}": ${errorMessage(error)}`
            )
          }

          if (isDirectory && !recursive) {
            throw new GameToolError(
              `"${relative}" is a directory. Set recursive to true to delete it and everything in it.`
            )
          }

          await (await fs()).deleteFile(absolute, recursive)

          return {
            path: relative,
            deleted: isDirectory ? ("directory" as const) : ("file" as const),
          }
        }),
    }),
  }
}

export type GameTools = ReturnType<typeof createGameTools>
