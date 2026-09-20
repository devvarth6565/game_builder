import type { SystemModelMessage } from "ai"

import { GAME_DIR, GAME_SERVER_PORT } from "@/lib/daytona/utils"

export const runtimeInstructions: SystemModelMessage = {
  role: "system",
  content: `## Runtime environment

Each game lives in its own isolated Daytona sandbox, a Linux container created when the chat starts.

- Game directory: \`${GAME_DIR}\`. Every file of the game goes here. Nothing outside this directory is served.
- Entry point: \`${GAME_DIR}/index.html\`. A new sandbox is seeded with a placeholder \`index.html\`, \`style.css\` and \`welcome.js\` (a holding screen showing a rotating cube), plus the \`engine/\` directory described below.
- Server: the directory is served as static files by \`python3 -m http.server ${GAME_SERVER_PORT} --directory ${GAME_DIR}\`. Server logs are written to \`/tmp/game-server.log\`.
- Preview: the user plays the game in an iframe that loads a signed Daytona preview URL for port ${GAME_SERVER_PORT}. The preview picks up file changes on reload; there is no hot reloading.
- Persistence: the sandbox may be stopped when idle and restarted when the preview is opened. Files in the game directory persist; running processes do not.

## What this means for the game

- Static files only. There is no backend, no database and no server-side code. Anything dynamic runs in the browser (HTML, CSS and JavaScript). Use \`localStorage\` for saves and high scores.
- No build step. The static server serves files as they are, so do not rely on bundlers, TypeScript compilation, JSX or \`npm install\`. Write plain browser JavaScript and split code across files with \`<script type="module">\` and native ES module imports.
- Use relative paths (\`./game.js\`, \`./engine/index.js\`) for every file reference, because the game is served behind a preview proxy.
- Generate content rather than loading it: build geometry, textures and sound in code. The bundled engine does all three. If you do need an external library, load a pinned version from jsDelivr or cdnjs with an exact version in the URL.
- The game runs inside an iframe, so it must not depend on opening new windows or on top-level navigation. The engine takes focus on the first pointer press so keyboard input works inside the frame.

## Seeded files

- \`engine/\` — a 3D game engine built on three.js, already present in every sandbox. Prefer it over writing a renderer, a collision system or an input layer by hand. **Never delete or rewrite files under \`engine/\`**; it is shared infrastructure, not part of the game. Add game code alongside it.
- \`index.html\` — keep the \`<script type="importmap">\` block exactly as seeded when you rewrite this file. It maps the bare specifier \`"three"\` to the pinned three.js build, and dropping it breaks any three.js addon.
- \`welcome.js\` and \`style.css\` — the holding screen. Delete \`welcome.js\` and its \`<script>\` tag on the first real build, and replace \`style.css\` with the game's own styles. Keep \`style.css\`'s first rules: a full-height \`body\` with no margin and a \`#game\` element filling it, which is what the engine sizes its canvas to.`,
}
