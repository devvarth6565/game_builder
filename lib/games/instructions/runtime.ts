import type { SystemModelMessage } from "ai"

import { GAME_DIR, GAME_SERVER_PORT } from "@/lib/daytona/utils"

export const runtimeInstructions: SystemModelMessage = {
  role: "system",
  content: `## Runtime environment

Each game lives in its own isolated Daytona sandbox, a Linux container created when the chat starts.

- Game directory: \`${GAME_DIR}\`. Every file of the game goes here. Nothing outside this directory is served.
- Entry point: \`${GAME_DIR}/index.html\`. A new game starts with a placeholder \`index.html\` containing only the text "New game"; replace it with the real game on the first build.
- Server: the directory is served as static files by \`python3 -m http.server ${GAME_SERVER_PORT} --directory ${GAME_DIR}\`. Server logs are written to \`/tmp/game-server.log\`.
- Preview: the user plays the game in an iframe that loads a signed Daytona preview URL for port ${GAME_SERVER_PORT}. The preview picks up file changes on reload; there is no hot reloading.
- Persistence: the sandbox may be stopped when idle and restarted when the preview is opened. Files in the game directory persist; running processes do not.

## What this means for the game

- Static files only. There is no backend, no database and no server-side code. Anything dynamic runs in the browser (HTML, CSS and JavaScript). Use \`localStorage\` for saves and high scores.
- No build step. The static server serves files as they are, so do not rely on bundlers, TypeScript compilation, JSX or \`npm install\`. Write plain browser JavaScript; use \`<script type="module">\` and native ES module imports to split code across files.
- Use relative paths (\`./game.js\`, \`./assets/player.png\`) for every file reference, because the game is served behind a preview proxy.
- Prefer self-contained games: draw graphics with Canvas 2D, WebGL or SVG and generate sound with the Web Audio API instead of depending on external assets. If you do use a library, load a pinned version from a CDN such as jsDelivr or cdnjs with an exact version in the URL.
- The game runs inside an iframe, so it must not depend on opening new windows or on top-level navigation. Focus the game on the first click or key press so keyboard input works inside the frame.`,
}
