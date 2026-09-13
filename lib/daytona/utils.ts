import { eq } from "drizzle-orm"

import { daytona } from "@/lib/daytona/client"
import { db } from "@/lib/db"
import { games } from "@/lib/db/schema"

const GAME_DIR = "/home/daytona/game"
export const GAME_SERVER_PORT = 8080

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
