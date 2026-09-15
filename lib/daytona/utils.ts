import { DaytonaNotFoundError } from "@daytona/sdk"
import { eq } from "drizzle-orm"

import { daytona } from "@/lib/daytona/client"
import { db } from "@/lib/db"
import { games } from "@/lib/db/schema"

export const GAME_DIR = "/home/daytona/game"
export const GAME_SERVER_PORT = 8080

const SETTLING_STATES = new Set<string | undefined>([
  "stopping",
  "archiving",
  "pausing",
])

export async function createGameSandbox(gameId: string) {
  const sandbox = await daytona.create({ labels: { gameId } })

  await sandbox.fs.createFolder(GAME_DIR, "755")
  await sandbox.fs.uploadFile(Buffer.from("New game"), `${GAME_DIR}/index.html`)

  await db
    .update(games)
    .set({ sandboxId: sandbox.id, updatedAt: new Date() })
    .where(eq(games.id, gameId))

  return sandbox
}

// Returns the game's sandbox in the "started" state, ready for tools to use.
// Starts it if stopped or archived, waits out in-flight transitions, recovers
// recoverable errors, and replaces it with a fresh sandbox when it is missing,
// destroyed, or broken beyond recovery.
export async function getGameSandbox(gameId: string) {
  const [game] = await db
    .select({ sandboxId: games.sandboxId })
    .from(games)
    .where(eq(games.id, gameId))
  if (!game) {
    throw new Error(`Game ${gameId} not found`)
  }

  if (!game.sandboxId) {
    return createGameSandbox(gameId)
  }

  let sandbox: Sandbox
  try {
    sandbox = await daytona.get(game.sandboxId)
  } catch (error) {
    if (error instanceof DaytonaNotFoundError) {
      return createGameSandbox(gameId)
    }
    throw error
  }

  // A sandbox can't be started mid-shutdown, so let these transitions settle.
  for (let attempt = 0; SETTLING_STATES.has(sandbox.state); attempt++) {
    if (attempt >= 60) {
      throw new Error(`Sandbox ${sandbox.id} stuck in state ${sandbox.state}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await sandbox.refreshData()
  }

  switch (sandbox.state) {
    case "started":
      break
    case "creating":
    case "starting":
    case "restoring":
    case "resuming":
    case "pulling_snapshot":
      await sandbox.waitUntilStarted()
      break
    case "error":
    case "build_failed":
      if (!sandbox.recoverable) {
        return createGameSandbox(gameId)
      }
      await sandbox.recover()
      break
    case "destroyed":
    case "destroying":
      return createGameSandbox(gameId)
    default:
      await sandbox.start()
  }

  return sandbox
}

type Sandbox = Awaited<ReturnType<typeof daytona.get>>

async function isGameServerHealthy(sandbox: Sandbox) {
  const response = await sandbox.process.executeCommand(
    `python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${GAME_SERVER_PORT}', timeout=2)"`
  )
  return response.exitCode === 0
}

// Serves the game's index.html on GAME_SERVER_PORT, reusing a server that is
// already up, and returns the running sandbox.
export async function startGameServer(sandboxId: string) {
  const sandbox = await daytona.get(sandboxId)

  if (sandbox.state !== "started") {
    await sandbox.start()
  }

  if (!(await isGameServerHealthy(sandbox))) {
    await sandbox.process.executeCommand(
      `sh -c "nohup python3 -m http.server ${GAME_SERVER_PORT} --directory ${GAME_DIR} > /tmp/game-server.log 2>&1 &"`
    )

    let healthy = false
    for (let attempt = 0; attempt < 10 && !healthy; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      healthy = await isGameServerHealthy(sandbox)
    }
    if (!healthy) {
      throw new Error(`Game server in sandbox ${sandboxId} did not start`)
    }
  }

  return { sandbox }
}
