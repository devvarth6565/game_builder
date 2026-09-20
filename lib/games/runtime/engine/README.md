# Engine reference

A small 3D game engine built on three.js. It ships in every sandbox, so it is
already there before the first turn — nothing to install, nothing to download.

Everything is plain ES modules served as static files. Import from
`./engine/index.js`, or from a single module (`./engine/models.js`) when that is
all you need.

```js
import { createGame, models, anim, THREE } from "./engine/index.js"
```

**Keep the `<script type="importmap">` block in `index.html`.** It is what maps
the bare specifier `"three"` to the pinned CDN build. The engine itself imports
three.js by absolute URL, so it survives without the map, but three.js addons
(GLTFLoader, post-processing) do not.

---

## Quick start

```js
import { createGame, models, anim, ThirdPersonController } from "./engine/index.js"

const game = createGame({ lighting: "day" })
const { engine, physics, hud, fx, state, sound } = game

// Ground, made solid.
const floor = models.platform({ width: 60, depth: 60, thickness: 2 })
floor.position.y = -1
engine.add(floor)
physics.addObject(floor)

// A player that walks, turns and jumps, with a chase camera.
const hero = models.character({ shirt: "#ea580c" })
engine.add(hero)
const player = new ThirdPersonController({ engine, world: physics, mesh: hero })

// HUD.
const score = hud.text("score", { label: "Score", value: 0 })
state.on("score", (value) => score.set(value))

// Per-frame work.
engine.onUpdate((dt) => {
  anim.animateCharacter(hero.rig, {
    time: engine.time,
    speed: player.speedRatio,
    grounded: player.body.onGround,
    verticalSpeed: player.body.velocity.y,
  })
})
```

`createGame` already runs physics on the fixed tick and updates tweens, so the
only thing left is your game logic.

---

## The frame loop

```js
engine.onFixed((step) => {})   // 60 Hz, constant step — movement, physics, AI
engine.onUpdate((dt) => {})    // once per drawn frame — camera, animation, HUD
engine.onRender((dt) => {})    // just before the draw call
engine.onResize((w, h) => {})  // canvas resized
```

Each returns a function that unsubscribes. All times are **seconds**.

Put anything that affects gameplay in `onFixed` so it behaves the same on a
30 Hz phone and a 144 Hz monitor. Put anything cosmetic in `onUpdate`.

Read `engine.time`, `engine.delta`, `engine.frame`, `engine.fps` any time.

---

## Modules

| Module | What it gives you |
| --- | --- |
| `engine.js` | `Engine` — renderer, scene, camera, loop, resize, shake, picking |
| `game.js` | `createGame()` — wires everything below together |
| `input.js` | `Input` — keyboard, mouse, touch, pointer lock, gamepad, actions |
| `physics.js` | `PhysicsWorld`, `Body`, `Box` — AABB collide-and-slide, triggers, raycasts |
| `controls.js` | First-person, third-person, top-down, platformer, vehicle, orbit, follow |
| `hud.js` | `HUD` — score readouts, bars, banners, menus, touch controls |
| `models.js` | Procedural characters, props, scenery, vehicles |
| `materials.js` | Palette, material factories, canvas textures |
| `lighting.js` | Day / night / studio / dungeon / space / sunset rigs |
| `world.js` | Terrain, tile maps, mazes, arenas, skies, instanced scatter |
| `animation.js` | `damp`, tweens, springs, easing, character poses, clip playback |
| `particles.js` | `Particles`, `Trail` — pooled bursts in one draw call |
| `sound.js` | `Sound` — synthesised effects and music, no files |
| `state.js` | `StateMachine`, `GameState`, `Pool`, `Cooldown`, `storage` |
| `random.js` | `RNG` (seeded), value noise, fBm |
| `debug.js` | FPS/draw-call overlay, collider and bounds visualisation |

---

## Engine

```js
const engine = new Engine({
  container,          // element to fill (default: body); it sizes to this
  background,         // colour or texture
  fog,                // { color, near, far } or { color, density }
  projection,         // "perspective" | "orthographic"
  fov, near, far, frustumSize,
  shadows,            // default true
  fixedStep,          // default 1/60
  toneMapping,        // default THREE.NeutralToneMapping
  maxPixelRatio,      // default 2
})
```

| Method | Purpose |
| --- | --- |
| `add(...objects)` / `remove(...)` | scene membership |
| `pause()` / `resume()` / `togglePause()` | freeze simulation, keep rendering |
| `shake(amount, duration)` | camera kick on hits and explosions |
| `raycastFromPointer(objects)` | click and hover picking |
| `pointerOnGround(y)` | where the cursor is on a horizontal plane |
| `worldToScreen(position)` | `{x, y, visible}` in pixels, for HTML markers |
| `setFog(fog)` / `setCamera(camera)` | swap either at runtime |
| `clearScene({ keep })` | dispose everything — use between levels |
| `await enableBloom({ strength })` | optional glow (needs the import map) |

The canvas follows its container through a `ResizeObserver`, which is what makes
a game fill the preview frame at any size. It also takes window focus on the
first pointer press so keyboard input works inside the iframe.

---

## Input

Poll it; do not listen for events.

```js
input.isDown("KeyW")         // also "w", "Mouse0", or an action name
input.justPressed("jump")    // true for exactly one frame
input.justReleased("Space")
input.axis("left", "right")  // -1, 0 or 1
input.moveVector()           // { x, y } merged from WASD + stick + touch
input.lookVector()           // mouse/touch drag + right stick, this frame
input.pointer                // { x, y, ndc, dx, dy, wheel, inside }
input.lock() / input.unlock()
input.bind({ dash: ["ShiftLeft", "Mouse1"] })
```

Default actions: `up down left right jump sprint crouch fire aim interact pause
restart`. Touch widgets from the HUD feed the same names, so a game written for
the keyboard works on a phone with no extra code.

---

## Physics

Boxes, one axis resolved at a time — the familiar slide-along-the-wall feel.

```js
physics.addObject(mesh)                      // make a placed mesh solid
physics.addObjects(levelGroup, { filter })   // one collider per mesh
physics.addBox(center, size)
physics.addTrigger(center, size, { tag: "goal" })
physics.onTriggerEnter((body, collider) => {})

const body = physics.addBody({
  position, size,          // full width/height/depth
  mesh,                    // kept in sync each step
  gravity: true,
  stepHeight: 0.4,         // auto-climb kerbs and stairs
  friction: 10, bounce: 0,
})

physics.step(dt)                             // createGame does this for you
physics.raycast(origin, direction, maxDist)  // -> { distance, point, collider }
physics.groundHeight(x, z)
physics.overlappingBodies(body)
```

After a step, read `body.onGround`, `body.hitWall`, `body.hitCeiling`.

Helpers: `spheresOverlap`, `distanceXZ`, `canSee(origin, forward, target, range, fov)`.

Moving colliders (lifts, platforms) must go through `physics.moveCollider()` so
the broadphase index stays correct.

---

## Controllers

All take `{ engine, world, mesh, ... }`, self-register on the fixed tick, and
expose `enabled` and `dispose()`.

| Controller | For |
| --- | --- |
| `FirstPersonController` | pointer-lock FPS, with head bob |
| `ThirdPersonController` | chase camera, character turns to face travel |
| `TopDownController` | twin-stick, dungeon crawler, strategy (`faceCursor`) |
| `PlatformerController` | side-on XY movement, `maxJumps` for double jump |
| `VehicleController` | arcade driving, speed-scaled steering |
| `OrbitCamera` | drag to orbit, wheel/pinch to zoom (no addon needed) |
| `FollowCamera` | damped follow with a fixed offset |

Each movement controller creates a `Body` at `controller.body`. Jumping already
has coyote time and input buffering — do not reimplement them.

`ThirdPersonController` exposes `speedRatio` (0–1), which feeds straight into
`anim.animateCharacter`.

---

## HUD

DOM over the canvas, in a nine-slot grid (`top-left` … `bottom-right`, `center`).
It injects its own CSS, so it survives you replacing `style.css`.

```js
hud.text("score", { slot: "top-left", label: "Score", value: 0 }).set(120)
hud.bar("health", { label: "Health", max: 100 }).set(65)
hud.pips("lives", { slot: "top-right", count: 3 }).set(2)
hud.crosshair("dot")
hud.hint("Move <kbd>WASD</kbd> · Jump <kbd>Space</kbd>")
hud.banner("Level 2", { duration: 1.4 })
hud.toast("Key collected")
hud.flashScreen("rgba(225,29,72,0.35)")   // damage tint

hud.screen({
  title: "Ember Run",
  body: "Reach the gate before the fire does.",
  stats: [{ label: "Best", value: 1240 }],
  actions: [{ label: "Play", primary: true, onSelect: start }],
  hint: "Press <kbd>Enter</kbd>",
  dismissible: true,
})

hud.touchControls({ input: engine.input, buttons: [{ label: "JUMP", action: "jump" }] })
```

`hud.screen()` is the start screen, the pause menu and the game-over screen.
Its buttons are focusable and work from the keyboard.

`hud.touchControls()` adds nothing on a desktop, so it is always safe to call.

---

## Models

Every builder returns a `THREE.Group` whose origin sits on the ground.

Characters — `character({ skin, shirt, pants, hat, height })` — also carry
`group.rig` with `torso, head, leftArm, rightArm, leftLeg, rightLeg`.

```
character  slime  drone
tree  pineTree  bush  rock  crate  barrel  cloud
coin  gem  heart  star  key  chest
platform  stairs  house  wall  portal  flag  torch
car  spaceship  projectile  turret
ground  water
box  cylinder  ball  cone            (primitives)
setShadows(object)  recolor(object, color)
```

`torch()` includes a real `PointLight` at `group.userData.light`.

---

## Materials

`PALETTE` holds the house colours. `solid()` is the default surface —
flat-shaded, matte, and **cached**, so a thousand crates share one material.

```js
materials.solid("#ea580c")        // the default
materials.smooth(color)           // no flat shading
materials.toon(color, 4)          // cel bands
materials.glow(color, 1.6)        // self-lit; really glows with bloom
materials.unlit(color)            // no lighting at all
materials.metal() / .glass() / .sprite()
materials.textSprite("Goal")      // world-space label facing the camera
```

Because materials are cached, **clone before mutating one instance** —
`anim.flash()` already does this.

Textures are drawn on a canvas at load time: `gradientTexture`, `checkerTexture`,
`gridTexture`, `blobTexture`, `noiseTexture`, `textTexture`.

---

## Lighting

```js
setupLighting(engine, "day", { area: 60 })
// "day" | "night" | "studio" | "dungeon" | "space" | "sunset"
```

Each returns `{ sun, hemisphere, ambient, ... }`. `area` is the side of the box
the shadow map covers — keep it just big enough for the playable space, or
shadows go blocky.

For an open world, keep the shadow box on the player:

```js
const follow = followShadows(rig.sun, player.body)
engine.onUpdate(follow)
```

`flicker(light)` returns an update function for torches and fires.

---

## World

```js
const land = terrain({ size: 120, amplitude: 9, seed: 7, flatRadius: 20 })
land.heightAt(x, z)                       // place objects exactly on the surface

skyDome({ top, bottom })  starfield({ count })
arena({ size: 40, wallHeight: 3 })        // floor + four walls
tileMap({ cols, rows, cellSize, get: (x, y) => ({ height }) | null })
tileMapColliders(tiles, physics)          // instanced tiles need this
mazeMesh(generateMaze(21, 21, seed))
scatter({ count, size, minDistance, rng, heightAt, exclude, place })
new InstancedField(scene, geometry, material, max)   // one draw call for many
```

`tileMap` is the fastest route from a level drawn as text to real geometry.

---

## Animation

`damp` is the one to reach for. `x += (target - x) * 0.1` runs twice as fast at
120 fps; `damp` does not.

```js
anim.damp(current, target, lambda, dt)    // lambda: 4 lazy, 10 responsive, 25 snappy
anim.dampAngle(...)                        // takes the short way round
anim.animateCharacter(rig, { time, speed, grounded, verticalSpeed })
anim.bob / spin / pulse / squashStretch / billboard / flash

tweens.to(mesh, { "position.y": 3 }, { duration: 0.4, ease: "outBack" })
await tweens.toAsync(...)
new Spring({ stiffness: 170, damping: 22 })   // chases a moving target
new ClipPlayer(gltf.scene, gltf.animations).play("Run", { fade: 0.2 })
```

`Easing` includes `outBack`, `outElastic` and `outBounce` — the ones that make a
pickup or a menu feel alive.

---

## Particles and sound

```js
fx.burst(position, { preset: "explosion" })
// sparks explosion smoke dust confetti heal magic blood bubbles
fx.burst(position, { count: 30, color: "#fb923c", speed: 9, direction, spread: 0.3 })
new Trail(scene, { length: 24 })
```

```js
sound.play("coin")
// jump doubleJump land step coin powerup heal hit hurt explosion laser shoot
// swoosh click select error open win lose spawn tick alarm splash
sound.playAt("explosion", position, engine.camera)
const track = sound.music({ mood: "arcade" })   // adventure tense calm arcade boss
```

Browsers block audio until the player interacts, so the first sound may not play
until the first click or key press. That is expected; do not work around it.

---

## Game structure

```js
const phase = new StateMachine({
  initial: "menu",
  states: {
    menu:     { enter: showMenu, exit: hideMenu },
    playing:  { update: (dt) => stepGame(dt) },
    gameover: { enter: showResults },
  },
})
engine.onUpdate((dt) => phase.update(dt))

state.addScore(10)       // GameState; persists `best` to localStorage
state.loseLife()         // emits "death", then "gameover" at zero
state.on("gameover", ({ score, best }) => {})

new Cooldown(0.25)       // fire rate, dash recharge
new Ticker(2, spawn)     // wave timer
new Pool(make, reset)    // recycle bullets instead of allocating
storage.save(key, value) // guarded localStorage
new RNG("seed")          // deterministic worlds
```

---

## Performance

The engine is built so a generated game runs on a laptop without tuning, but
three things still matter:

1. **Draw calls.** Use `InstancedField` or `tileMap` for anything that appears
   dozens of times. Check the count with `new DebugOverlay(engine)`.
2. **Shadow area.** Keep `area` tight; every doubling quarters the resolution.
3. **Allocation in the loop.** Do not build `new THREE.Vector3()` per frame per
   object — hoist it, or use `Pool`.

`sceneStats(engine.scene)` prints objects, meshes and triangles when something
starts to feel heavy.
