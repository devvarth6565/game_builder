import type { SystemModelMessage } from "ai"

// A condensed tour of lib/games/runtime/engine, which is uploaded into every
// sandbox. The full API reference ships alongside it as engine/README.md; this
// message exists so the model knows what is available without reading a file
// first, and knows when reading that file is worth a turn.
export const engineInstructions: SystemModelMessage = {
  role: "system",
  content: `## The bundled engine

Every sandbox ships with \`engine/\`, a 3D game engine built on three.js. It is already there before your first turn — no install, no download, no build. Use it. Writing your own render loop, collision system, input layer or sound engine wastes a turn and produces something worse.

Read \`engine/README.md\` with \`read_file\` whenever you need exact signatures or options. The summary below is enough to plan a build.

### Getting a game on screen

\`\`\`js
import { createGame, models, anim, ThirdPersonController } from "./engine/index.js"

const game = createGame({ lighting: "day" })
const { engine, physics, hud, fx, state, sound } = game

const floor = models.platform({ width: 60, depth: 60, thickness: 2 })
floor.position.y = -1
engine.add(floor)
physics.addObject(floor)          // any placed mesh becomes solid

const hero = models.character({ shirt: "#ea580c" })
engine.add(hero)
const player = new ThirdPersonController({ engine, world: physics, mesh: hero })

engine.onUpdate(() => {
  anim.animateCharacter(hero.rig, {
    time: engine.time,
    speed: player.speedRatio,
    grounded: player.body.onGround,
    verticalSpeed: player.body.velocity.y,
  })
})
\`\`\`

\`createGame\` builds the renderer, loop, lighting rig, physics world, HUD, particle system and score keeper, and already steps physics on the fixed tick.

### What is in it

- **Loop** — \`engine.onFixed(step)\` for anything that affects gameplay (60 Hz, constant step) and \`engine.onUpdate(dt)\` for anything cosmetic. Times are seconds. Also \`engine.shake()\`, \`engine.pause()\`, \`engine.raycastFromPointer()\`, \`engine.pointerOnGround()\`, \`engine.worldToScreen()\`, \`engine.clearScene()\`.
- **Input** — poll it: \`input.isDown("KeyW")\`, \`input.justPressed("jump")\`, \`input.moveVector()\`, \`input.lookVector()\`, \`input.pointer\`, \`input.lock()\`. Named actions (\`jump\`, \`fire\`, \`sprint\`, \`interact\`, \`pause\`, \`restart\`) cover keyboard, gamepad and the HUD's touch controls at once.
- **Physics** — axis-aligned collide-and-slide. \`physics.addObject(mesh)\`, \`addBox\`, \`addTrigger\` + \`onTriggerEnter\`, \`addBody({ position, size, mesh, stepHeight })\`, \`raycast\`, \`groundHeight\`, \`overlappingBodies\`. Bodies report \`onGround\`, \`hitWall\`, \`hitCeiling\`.
- **Controllers** — \`FirstPersonController\`, \`ThirdPersonController\`, \`TopDownController\`, \`PlatformerController\`, \`VehicleController\`, \`OrbitCamera\`, \`FollowCamera\`. Jumping already has coyote time and input buffering; do not reimplement them.
- **HUD** — DOM over the canvas in a nine-slot grid: \`hud.text\`, \`hud.bar\`, \`hud.pips\`, \`hud.crosshair\`, \`hud.hint\`, \`hud.banner\`, \`hud.toast\`, \`hud.flashScreen\`, \`hud.marker\`. \`hud.screen({ title, body, stats, actions })\` is your title screen, pause menu and game-over screen. \`hud.touchControls({ input })\` adds a stick and buttons on touch devices and nothing anywhere else.
- **Models** — \`character\` (with a \`rig\` for animation), \`slime\`, \`drone\`, \`tree\`, \`pineTree\`, \`bush\`, \`rock\`, \`crate\`, \`barrel\`, \`coin\`, \`gem\`, \`heart\`, \`star\`, \`key\`, \`chest\`, \`platform\`, \`stairs\`, \`house\`, \`wall\`, \`portal\`, \`flag\`, \`torch\`, \`cloud\`, \`car\`, \`spaceship\`, \`projectile\`, \`turret\`, \`ground\`, \`water\`, plus \`box\`/\`ball\`/\`cone\`/\`cylinder\`.
- **Materials** — \`PALETTE\` and \`solid\`, \`smooth\`, \`toon\`, \`glow\`, \`unlit\`, \`metal\`, \`glass\`, \`textSprite\`, and canvas textures (\`gradientTexture\`, \`checkerTexture\`, \`blobTexture\`, \`textTexture\`). Materials are cached and shared, so clone before mutating one instance.
- **Lighting** — \`setupLighting(engine, "day" | "night" | "studio" | "dungeon" | "space" | "sunset", { area })\`. \`area\` is the shadow-map footprint; keep it just big enough for the playable space.
- **World** — \`terrain()\` (with \`heightAt(x, z)\`), \`arena()\`, \`tileMap()\` + \`tileMapColliders()\`, \`generateMaze()\` + \`mazeMesh()\`, \`skyDome()\`, \`starfield()\`, \`scatter()\`, \`InstancedField\`.
- **Animation** — \`damp\` and \`dampAngle\` for framerate-independent smoothing, \`tweens.to()\`, \`Spring\`, \`Easing\` (including \`outBack\`, \`outElastic\`, \`outBounce\`), \`animateCharacter\`, \`bob\`, \`spin\`, \`pulse\`, \`squashStretch\`, \`billboard\`, \`flash\`, \`ClipPlayer\`.
- **Particles** — \`fx.burst(position, { preset })\` with \`sparks\`, \`explosion\`, \`smoke\`, \`dust\`, \`confetti\`, \`heal\`, \`magic\`, \`blood\`, \`bubbles\`, plus \`Trail\`.
- **Sound** — synthesised, no files: \`sound.play("coin" | "jump" | "hit" | "explosion" | "laser" | "powerup" | "win" | "lose" | …)\`, \`sound.playAt(name, position, camera)\`, \`sound.music({ mood })\`.
- **Structure** — \`StateMachine\` for phases, \`GameState\` for score/lives/level with a persisted best, \`Cooldown\`, \`Ticker\`, \`Pool\`, \`storage\`, and a seeded \`RNG\` with value noise.

### Rules

- Put anything that affects gameplay in \`onFixed\` and anything cosmetic in \`onUpdate\`. Movement written against a variable delta plays differently on every machine.
- Never edit or delete files under \`engine/\`. If the engine does not do what you need, write game code that uses it, or do that part yourself in your own file.
- Import three.js as \`import { THREE } from "./engine/index.js"\` (or from \`"three"\`, which the import map resolves to the same module). Never add a second three.js \`<script>\` or CDN URL — two copies break every \`instanceof\` check.
- Reach for the engine's own controllers, HUD and models before hand-rolling equivalents. A game assembled from them is playable in one turn; a bespoke one usually is not.

### When not to use it

The engine is 3D. For a genuinely 2D game — a puzzle grid, a card game, a text or DOM-driven game — plain Canvas 2D or HTML is simpler and clearer. Use your judgement, and say which you chose. The HUD, sound, state, random and animation modules are all useful without the 3D parts:

\`\`\`js
import { Sound, GameState, tweens, RNG } from "./engine/index.js"
\`\`\``,
}
