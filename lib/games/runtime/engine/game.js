/*
  One call that wires the whole engine together.

  Building a game out of the individual modules is fine and sometimes right, but
  nearly every game wants the same six things connected the same way: a renderer
  and loop, a lighting rig, collision, particles, sound, a HUD and a score. This
  does that, and returns the pieces so you can reach past it whenever you need
  to.

    import { createGame } from "./engine/index.js"

    const game = createGame({ lighting: "day", gravity: -26 })
    const { engine, hud, physics, fx, sound, state } = game

  The physics world is already stepping on the fixed tick and tweens are already
  updating, so all that is left is to build a level and move something around.
*/

import { Engine } from "./engine.js"
import { HUD } from "./hud.js"
import { Particles } from "./particles.js"
import { PhysicsWorld } from "./physics.js"
import { setupLighting } from "./lighting.js"
import { sound as sharedSound } from "./sound.js"
import { GameState } from "./state.js"
import { tweens } from "./animation.js"

/**
 * @param {object} [options]
 * @param {HTMLElement} [options.container] defaults to #game or body
 * @param {string|false} [options.lighting] "day"|"night"|"studio"|"dungeon"|
 *   "space"|"sunset", or false to light the scene yourself
 * @param {object} [options.lightingOptions] passed to the preset
 * @param {number} [options.gravity] physics gravity (default -24)
 * @param {boolean|object} [options.particles] false to skip, or Particles options
 * @param {object} [options.state] GameState options (lives, saveKey, …)
 * @param {boolean} [options.hud] false to skip the HUD
 * ...any other option is forwarded to the Engine (background, fog, fov, …)
 */
export function createGame(options = {}) {
  const {
    container = document.getElementById("game") || document.body,
    lighting = "day",
    lightingOptions = {},
    gravity = -24,
    particles = true,
    state: stateOptions = {},
    hud: wantsHud = true,
    ...engineOptions
  } = options

  const engine = new Engine({ container, ...engineOptions })

  const physics = new PhysicsWorld({ gravity })
  // Collision runs on the fixed tick so it behaves identically on every device.
  engine.onFixed((dt) => physics.step(dt))

  // Tweens run on the variable tick — they are presentation, not simulation.
  tweens.attach(engine)

  const lights = lighting ? setupLighting(engine, lighting, lightingOptions) : null
  const hud = wantsHud ? new HUD(container) : null
  const fx = particles
    ? new Particles(engine, typeof particles === "object" ? particles : {})
    : null
  const state = new GameState(stateOptions)

  const game = {
    engine,
    physics,
    hud,
    fx,
    lights,
    state,
    tweens,
    sound: sharedSound,
    input: engine.input,
    scene: engine.scene,
    camera: engine.camera,

    /** Tears everything down — use between a full level rebuild. */
    dispose() {
      fx?.dispose()
      hud?.dispose()
      tweens.cancelAll()
      sharedSound.stopMusic()
      engine.dispose()
    },
  }

  return game
}
