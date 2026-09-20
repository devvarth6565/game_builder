/*
  The engine's public surface. Import everything from here:

    import { createGame, models, THREE } from "./engine/index.js"

  or cherry-pick:

    import { Engine, PhysicsWorld, HUD } from "./engine/index.js"

  Modules are also importable directly (./engine/models.js and so on) when you
  only want one of them.
*/

// three.js itself, so a game never needs a second import of it.
export * as THREE from "./three.js"
export { THREE_VERSION, THREE_ADDONS } from "./three.js"

// Namespaced re-exports, for when a bare name would be ambiguous — `models.box`
// and `models.key` read better than importing `box` and `key` on their own.
export * as models from "./models.js"
export * as materials from "./materials.js"
export * as lighting from "./lighting.js"
export * as world from "./world.js"
export * as anim from "./animation.js"

// Core
export { createGame } from "./game.js"
export { Engine } from "./engine.js"
export { Input, isTouchDevice } from "./input.js"
export { HUD } from "./hud.js"

// Simulation
export {
  Body,
  Box,
  Collider,
  PhysicsWorld,
  SpatialHash,
  canSee,
  distanceXZ,
  rayBox,
  spheresOverlap,
} from "./physics.js"

export {
  FirstPersonController,
  FollowCamera,
  JumpControl,
  OrbitCamera,
  PlatformerController,
  ThirdPersonController,
  TopDownController,
  VehicleController,
} from "./controls.js"

// Presentation
export {
  ClipPlayer,
  Easing,
  Spring,
  Tweens,
  animateCharacter,
  billboard,
  bob,
  clamp,
  damp,
  dampAngle,
  dampVector,
  flash,
  idlePose,
  jumpPose,
  lerp,
  pulse,
  remap,
  smoothstep,
  spin,
  squashStretch,
  tweens,
  walkCycle,
} from "./animation.js"

export { PALETTE, RAMPS, sampleRamp } from "./materials.js"
export { setupLighting, LIGHTING_PRESETS, configureShadows, followShadows, flicker } from "./lighting.js"
export { PARTICLE_PRESETS, Particles, Trail } from "./particles.js"
export { Sound, sound, note, SCALES } from "./sound.js"

// World building
export {
  InstancedField,
  arena,
  generateMaze,
  groundGrid,
  mazeMesh,
  ringPoints,
  scatter,
  skyDome,
  starfield,
  terrain,
  tileMap,
  tileMapColliders,
} from "./world.js"

// Game structure
export {
  Cooldown,
  Events,
  GameState,
  HighScores,
  Pool,
  StateMachine,
  Ticker,
  storage,
} from "./state.js"

export { RNG, fbm2D, hashSeed, ridgeNoise2D, rng, valueNoise2D } from "./random.js"

// Debugging
export {
  DebugOverlay,
  sceneStats,
  setWireframe,
  showAxes,
  showBounds,
  showColliders,
  showShadowCamera,
} from "./debug.js"
