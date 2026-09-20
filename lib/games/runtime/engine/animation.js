/*
  Motion: framerate-independent smoothing, tweens, springs, procedural character
  animation, and a thin wrapper over three.js's AnimationMixer for imported
  clips.

  The single most useful function here is `damp`. Writing
  `x += (target - x) * 0.1` every frame looks smooth at 60 fps and is twice as
  fast at 120 fps; `damp` behaves identically at any framerate.
*/

import * as THREE from "./three.js"

// --- framerate-independent smoothing ----------------------------------------

/**
 * Exponential approach. `lambda` is roughly "how many times closer per second":
 * 4 is lazy, 10 is responsive, 25 is nearly instant.
 */
export function damp(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt)
}

/** Same, but takes the short way around a circle. Angles in radians. */
export function dampAngle(current, target, lambda, dt) {
  let delta = target - current
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return current + delta * (1 - Math.exp(-lambda * dt))
}

export function dampVector(current, target, lambda, dt) {
  current.x = damp(current.x, target.x, lambda, dt)
  current.y = damp(current.y, target.y, lambda, dt)
  current.z = damp(current.z, target.z, lambda, dt)
  return current
}

export function lerp(a, b, t) {
  return a + (b - a) * t
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value
}

/** Maps `value` from one range to another, clamped to the output range. */
export function remap(value, inMin, inMax, outMin, outMax) {
  const t = clamp((value - inMin) / (inMax - inMin), 0, 1)
  return outMin + t * (outMax - outMin)
}

export function smoothstep(t) {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

// --- easing -----------------------------------------------------------------

export const Easing = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => --t * t * t + 1,
  inOutCubic: (t) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  inQuart: (t) => t * t * t * t,
  outQuart: (t) => 1 - --t * t * t * t,
  inExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  // Overshoots and settles — the "juice" easing for pop-in UI and pickups.
  outBack: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  inBack: (t) => 2.70158 * t * t * t - 1.70158 * t * t,
  outElastic: (t) =>
    t === 0 || t === 1
      ? t
      : Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * Math.PI * 2) / 3) + 1,
  outBounce: (t) => {
    const n = 7.5625
    const d = 2.75
    if (t < 1 / d) return n * t * t
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
    return n * (t -= 2.625 / d) * t + 0.984375
  },
}

// --- tweens -----------------------------------------------------------------

class Tween {
  constructor(target, to, options = {}) {
    const {
      duration = 0.4,
      delay = 0,
      ease = Easing.outCubic,
      onUpdate = null,
      onComplete = null,
      loop = false,
      yoyo = false,
    } = options

    this.target = target
    this.duration = Math.max(0.0001, duration)
    this.delay = delay
    this.ease = typeof ease === "string" ? Easing[ease] || Easing.linear : ease
    this.onUpdateCallback = onUpdate
    this.onCompleteCallback = onComplete
    this.loop = loop
    this.yoyo = yoyo
    this.elapsed = 0
    this.done = false
    this.direction = 1

    // Snapshot the start values, resolving dotted paths like "position.y".
    this.props = []
    for (const [key, end] of Object.entries(to)) {
      const { owner, name } = resolvePath(target, key)
      if (owner == null) continue
      this.props.push({ owner, name, start: owner[name], end })
    }
  }

  update(dt) {
    if (this.done) return true
    if (this.delay > 0) {
      this.delay -= dt
      if (this.delay > 0) return false
    }

    this.elapsed += dt * this.direction
    let t = clamp(this.elapsed / this.duration, 0, 1)
    const eased = this.ease(t)

    for (const prop of this.props) {
      prop.owner[prop.name] = prop.start + (prop.end - prop.start) * eased
    }
    this.onUpdateCallback?.(eased, this.target)

    if (this.elapsed >= this.duration) {
      if (this.yoyo) {
        this.direction = -1
        this.elapsed = this.duration
      } else if (this.loop) {
        this.elapsed = 0
      } else {
        this.done = true
        this.onCompleteCallback?.(this.target)
      }
    } else if (this.elapsed <= 0 && this.direction === -1) {
      if (this.loop) {
        this.direction = 1
        this.elapsed = 0
      } else {
        this.done = true
        this.onCompleteCallback?.(this.target)
      }
    }
    return this.done
  }

  cancel() {
    this.done = true
  }
}

function resolvePath(target, path) {
  const parts = path.split(".")
  let owner = target
  for (let i = 0; i < parts.length - 1; i++) {
    owner = owner?.[parts[i]]
    if (owner == null) return { owner: null, name: null }
  }
  return { owner, name: parts[parts.length - 1] }
}

/** Runs tweens. One instance is enough for a whole game. */
export class Tweens {
  constructor() {
    this.active = []
  }

  /**
   * `tweens.to(mesh, { "position.y": 3, "scale.x": 2 }, { duration: 0.5 })`
   * Returns the Tween, which has `cancel()`.
   */
  to(target, properties, options = {}) {
    const tween = new Tween(target, properties, options)
    this.active.push(tween)
    return tween
  }

  /** Promise form, for `await`-ing a sequence of moves. */
  toAsync(target, properties, options = {}) {
    return new Promise((resolve) => {
      this.to(target, properties, {
        ...options,
        onComplete: (t) => {
          options.onComplete?.(t)
          resolve(t)
        },
      })
    })
  }

  /** Runs `fn` after `seconds`. Cancelled by `cancelAll()` like any tween. */
  delay(seconds, fn) {
    return this.to({ v: 0 }, { v: 1 }, { duration: seconds, onComplete: fn })
  }

  cancelAll() {
    this.active.length = 0
  }

  /** Drops every tween touching `target` — call before removing an object. */
  cancelOf(target) {
    this.active = this.active.filter((tween) => tween.target !== target)
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (this.active[i].update(dt)) this.active.splice(i, 1)
    }
  }

  /** Subscribes to an engine so you never have to call update yourself. */
  attach(engine) {
    return engine.onUpdate((dt) => this.update(dt))
  }
}

/** Shared instance. Call `tweens.attach(engine)` once at startup. */
export const tweens = new Tweens()

// --- springs ----------------------------------------------------------------

/**
 * A damped spring. Unlike a tween it has no fixed duration — it chases a target
 * that can change at any moment, which is what makes it right for camera rigs,
 * recoil and UI that reacts to live values.
 */
export class Spring {
  constructor({ stiffness = 170, damping = 22, value = 0 } = {}) {
    this.stiffness = stiffness
    this.damping = damping
    this.value = value
    this.target = value
    this.velocity = 0
  }

  /** Kick the spring without moving its target — recoil, knockback, impact. */
  impulse(amount) {
    this.velocity += amount
    return this
  }

  update(dt) {
    // Sub-step so a long frame cannot make a stiff spring explode.
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
    const step = dt / steps
    for (let i = 0; i < steps; i++) {
      const force = -this.stiffness * (this.value - this.target)
      this.velocity += (force - this.damping * this.velocity) * step
      this.value += this.velocity * step
    }
    return this.value
  }
}

// --- procedural character animation -----------------------------------------
//
// These work on the rig that `models.character()` returns:
//   { root, torso, head, leftArm, rightArm, leftLeg, rightLeg }
// Anything with the same part names works too.

/** Swings arms and legs. `speed` 0 stands still, 1 walks, 2 runs. */
export function walkCycle(rig, time, speed = 1, amplitude = 0.9) {
  const phase = time * 6 * Math.max(0.0001, speed)
  const swing = Math.sin(phase) * amplitude * Math.min(1.4, speed)
  const counter = -swing

  if (rig.leftLeg) rig.leftLeg.rotation.x = swing
  if (rig.rightLeg) rig.rightLeg.rotation.x = counter
  if (rig.leftArm) rig.leftArm.rotation.x = counter * 0.8
  if (rig.rightArm) rig.rightArm.rotation.x = swing * 0.8
  if (rig.torso) {
    rig.torso.rotation.y = Math.sin(phase) * 0.08 * speed
    rig.torso.position.y =
      (rig.torso.userData.baseY ?? 0) + Math.abs(Math.sin(phase)) * 0.05 * speed
  }
}

/** Gentle breathing, for a character standing still. */
export function idlePose(rig, time, amount = 1) {
  const breath = Math.sin(time * 1.6) * 0.03 * amount
  if (rig.torso) {
    rig.torso.scale.y = 1 + breath
    rig.torso.rotation.y = 0
  }
  if (rig.head) rig.head.rotation.z = Math.sin(time * 0.9) * 0.04 * amount
  if (rig.leftArm) rig.leftArm.rotation.x = breath
  if (rig.rightArm) rig.rightArm.rotation.x = -breath
  if (rig.leftLeg) rig.leftLeg.rotation.x = 0
  if (rig.rightLeg) rig.rightLeg.rotation.x = 0
}

/** Legs tucked, arms up — hold this while the character is off the ground. */
export function jumpPose(rig, risingRatio = 0) {
  const t = clamp(risingRatio, -1, 1)
  if (rig.leftLeg) rig.leftLeg.rotation.x = -0.5 + t * 0.3
  if (rig.rightLeg) rig.rightLeg.rotation.x = 0.3 - t * 0.2
  if (rig.leftArm) rig.leftArm.rotation.x = -2.2
  if (rig.rightArm) rig.rightArm.rotation.x = -2.2
}

/** Blends idle → walk → jump from a controller's state. One call per frame. */
export function animateCharacter(rig, { time, speed = 0, grounded = true, verticalSpeed = 0 }) {
  if (!grounded) jumpPose(rig, clamp(verticalSpeed / 8, -1, 1))
  else if (speed > 0.08) walkCycle(rig, time, speed)
  else idlePose(rig, time)
}

// --- simple procedural motions ----------------------------------------------

/** Floats an object up and down. Call every frame. */
export function bob(object, time, { amplitude = 0.2, speed = 2, base = null } = {}) {
  const baseY = base ?? object.userData.bobBase ?? object.position.y
  object.userData.bobBase = baseY
  object.position.y = baseY + Math.sin(time * speed) * amplitude
}

export function spin(object, dt, speed = 1, axis = "y") {
  object.rotation[axis] += speed * dt
}

export function pulse(object, time, { amount = 0.08, speed = 4, base = 1 } = {}) {
  const scale = base + Math.sin(time * speed) * amount
  object.scale.setScalar(scale)
}

/**
 * Squash on impact, stretch in the air — the oldest trick in animation and the
 * fastest way to make a jump read well. Preserves volume.
 */
export function squashStretch(object, amount) {
  const stretch = 1 + clamp(amount, -0.6, 0.6)
  object.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch))
}

/** Makes an object always face the camera, upright. Labels, health bars, coins. */
export function billboard(object, camera, lockY = true) {
  if (lockY) {
    object.rotation.y = Math.atan2(
      camera.position.x - object.position.x,
      camera.position.z - object.position.z
    )
  } else {
    object.quaternion.copy(camera.quaternion)
  }
}

/**
 * Flashes a mesh a colour and restores it — hit feedback, invulnerability
 * frames, pickup confirmation. Safe to call while a flash is already running.
 */
export function flash(object, color = 0xffffff, duration = 0.12) {
  const targets = []
  object.traverse((child) => {
    if (child.isMesh && child.material && child.material.emissive) {
      targets.push(child)
    }
  })
  if (targets.length === 0) return

  for (const mesh of targets) {
    if (mesh.userData._flashing) continue
    // Materials are shared and cached, so clone before tinting one instance.
    const original = mesh.material
    const temporary = original.clone()
    temporary.emissive = new THREE.Color(color)
    temporary.emissiveIntensity = 1.2
    mesh.material = temporary
    mesh.userData._flashing = true

    setTimeout(() => {
      mesh.material = original
      temporary.dispose()
      mesh.userData._flashing = false
    }, duration * 1000)
  }
}

// --- clip playback (for loaded GLTF models) ---------------------------------

/**
 * Wraps AnimationMixer with named clips and crossfading, which is all most
 * games need from the clip system.
 *
 *   const anim = new ClipPlayer(gltf.scene, gltf.animations)
 *   anim.play("Run", { fade: 0.2 })
 *   engine.onUpdate((dt) => anim.update(dt))
 */
export class ClipPlayer {
  constructor(root, clips = []) {
    this.mixer = new THREE.AnimationMixer(root)
    this.actions = new Map()
    this.current = null
    for (const clip of clips) {
      this.actions.set(clip.name, this.mixer.clipAction(clip))
    }
  }

  get names() {
    return [...this.actions.keys()]
  }

  /**
   * @param {string} name
   * @param {object} [options] fade (seconds), loop ("repeat"|"once"|"pingpong"),
   *   speed, restart
   */
  play(name, options = {}) {
    const {
      fade = 0.2,
      loop = "repeat",
      speed = 1,
      restart = false,
      onFinish = null,
    } = options
    const action = this.actions.get(name)
    if (!action) return null
    if (this.current === action && !restart) return action

    action.reset()
    action.timeScale = speed
    action.clampWhenFinished = loop === "once"
    action.setLoop(
      loop === "once"
        ? THREE.LoopOnce
        : loop === "pingpong"
          ? THREE.LoopPingPong
          : THREE.LoopRepeat,
      Infinity
    )

    if (this.current && fade > 0) {
      action.crossFadeFrom(this.current, fade, true)
    }
    action.play()
    this.current = action

    if (onFinish) {
      const handler = (event) => {
        if (event.action !== action) return
        this.mixer.removeEventListener("finished", handler)
        onFinish()
      }
      this.mixer.addEventListener("finished", handler)
    }
    return action
  }

  stop() {
    this.mixer.stopAllAction()
    this.current = null
  }

  update(dt) {
    this.mixer.update(dt)
  }
}
