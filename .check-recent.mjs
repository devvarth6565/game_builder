import { neon } from "@neondatabase/serverless"
import { Daytona } from "@daytona/sdk"

const sql = neon(process.env.DATABASE_URL)
const rows =
  await sql`select id, title, sandbox_id, created_at, updated_at from games order by created_at desc limit 4`

const daytona = new Daytona()
for (const row of rows) {
  console.log(
    `\n=== ${row.title} | game ${row.id} | created ${row.created_at.toISOString()}`
  )
  if (!row.sandbox_id) {
    console.log("no sandbox")
    continue
  }
  try {
    const sandbox = await daytona.get(row.sandbox_id)
    const files = await sandbox.fs.listFiles("/home/daytona/game")
    console.log(
      "state:",
      sandbox.state,
      "| files:",
      files.map((f) => `${f.name}(${f.size}b)`).join(", ")
    )
    const html = await sandbox.fs.downloadFile("/home/daytona/game/index.html")
    console.log("index.html head:", JSON.stringify(html.toString().slice(0, 80)))
  } catch (error) {
    console.log("error:", error.message)
  }
}
