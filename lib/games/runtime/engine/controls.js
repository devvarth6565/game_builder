/*
  Camera rigs and character controllers.

  Each controller is a small object with an `update(dt)` that you either call
  yourself or, more usually, let it register on the engine for you (pass
  `engine` and it subscribes to the fixed step). They all expose `enabled` so a
  pause menu or cutscene can switch them off, and `dispose()` to unhook.

  Movement controllers optionally take a PhysicsWorld. Without one they move
  freely; with one they collide, land and slide.
*/

import * as THREE from "./three.js"

import { damp, dampAngle } from "./animation.js"
import { Body } from "./physics.js"

const UP = new THREE.Vector3(0, 1, 0)
const HALF_PI = Math.PI / 2

class Controller {
  constructor(engine, { autoUpdate = true, fixed = true } = {}) {
    this.engine = engine
    this.enabled = true
    this._unsubscribe = null
    if (engine && autoUpdate) {
      const subscribe = fixed ? engine.onFixed : engine.onUpdate
      this._unsubscribe = subscribe.call(engine, (dt) => {
        if (this.enabled) this.update(dt)
      })
    }
  }

  update() {}

  dispose() {
    this._unsubscribe?.()
    this._unsubscribe = null
    this.enabled = false
  }
}

/**
 * Drag to orbit, wheel or pinch to zoom, right-drag to pan. A self-contained
 * replacement for the OrbitControls addon, so it needs no import map and no
 * network request.
 */
export class OrbitCamera extends Controller {
  /**
   * @param {object} options
   * @param {Engine} options.engine
   * @param {THREE.Vector3|object} [options.target] point to orbit
   * @param {number} [options.distance]
   * @param {number} [options.minDistance] @param {number} [options.maxDistance]
   * @param {number} [options.minPolar] @param {number} [options.maxPolar] radians
   * @param {boolean} [options.enablePan] @param {boolean} [options.autoRotate]
   * @param {number} [options.damping] 0 = snappy, higher = smoother
   */
  constructor(options = {}) {
    const { engine, ...rest } = options
    super(engine, { fixed: false })

    const {
      camera = engine.camera,
      element = engine.canvas,
      target = { x: 0, y: 0, z: 0 },
      distance = 12,
      minDistance = 2,
      maxDistance = 80,
      minPolar = 0.05,
      maxPolar = Math.PI / 2 - 0.02,
      enablePan = true,
      enableZoom = true,
      autoRotate = false,
      autoRotateSpeed = 0.25,
      rotateSpeed = 0.005,
      zoomSpeed = 0.0015,
      damping = 12,
    } = rest

    this.camera = camera
    this.element = element
    this.target = new THREE.Vector3(target.x, target.y, target.z)
    this.minDistance = minDistance
    this.maxDistance = maxDistance
    this.minPolar = minPolar
    this.maxPolar = maxPolar
    this.enablePan = enablePan
    this.enableZoom = enableZoom
    this.autoRotate = autoRotate
    this.autoRotateSpeed = autoRotateSpeed
    this.rotateSpeed = rotateSpeed
    this.zoomSpeed = zoomSpeed
    this.damping = damping

    // Current (rendered) and desired (input) spherical coordinates.
    this.azimuth = Math.PI / 4
    this.polar = Math.PI / 3.2
    this.distance = distance
    this._azimuth = this.azimuth
    this._polar = this.polar
    this._distance = distance
    this._targetSmooth = this.target.clone()

    this._pointers = new Map()
    this._pinchDistance = 0
    this._bind()
    this.update(0)
  }

  _bind() {
    const el = this.element
    this._handlers = {
      down: (event) => {
        this._pointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
          button: event.button,
        })
        el.setPointerCapture?.(event.pointerId)
      },
      move: (event) => {
        const previous = this._pointers.get(event.pointerId)
        if (!previous) return
        const dx = event.clientX - previous.x
        const dy = event.clientY - previous.y
        previous.x = event.clientX
        previous.y = event.clientY

        if (this._pointers.size >= 2) {
          this._handlePinch()
          return
        }
        if (!this.enabled) return

        const panning =
          this.enablePan && (previous.button === 2 || event.shiftKey)
        if (panning) this._pan(dx, dy)
        else {
          this.azimuth -= dx * this.rotateSpeed
          this.polar = clamp(
            this.polar - dy * this.rotateSpeed,
            this.minPolar,
            this.maxPolar
          )
        }
      },
      up: (event) => {
        this._pointers.delete(event.pointerId)
        if (this._pointers.size < 2) this._pinchDistance = 0
      },
      wheel: (event) => {
        if (!this.enabled || !this.enableZoom) return
        this.distance = clamp(
          this.distance * (1 + event.deltaY * this.zoomSpeed),
          this.minDistance,
          this.maxDistance
        )
        event.preventDefault()
      },
    }

    el.addEventListener("pointerdown", this._handlers.down)
    el.addEventListener("pointermove", this._handlers.move)
    window.addEventListener("pointerup", this._handlers.up)
    window.addEventListener("pointercancel", this._handlers.up)
    el.addEventListener("wheel", this._handlers.wheel, { passive: false })
  }

  _handlePinch() {
    const points = [...this._pointers.values()]
    const spread = Math.hypot(
      points[0].x - points[1].x,
      points[0].y - points[1].y
    )
    if (this._pinchDistance > 0 && this.enableZoom) {
      const ratio = this._pinchDistance / spread
      this.distance = clamp(
        this.distance * ratio,
        this.minDistance,
        this.maxDistance
      )
    }
    this._pinchDistance = spread
  }

  _pan(dx, dy) {
    // Pan in the camera's own plane, scaled so it tracks the cursor at the
    // orbit distance regardless of zoom.
    const scale = (this.distance * 0.0022)
    const right = new THREE.Vector3()
      .setFromMatrixColumn(this.camera.matrix, 0)
      .multiplyScalar(-dx * scale)
    const up = new THREE.Vector3()
      .setFromMatrixColumn(this.camera.matrix, 1)
      .multiplyScalar(dy * scale)
    this.target.add(right).add(up)
  }

  /** Point the orbit at something (a selected unit, the player). */
  lookAt(position) {
    this.target.set(position.x, position.y, position.z)
    return this
  }

  update(dt) {
    if (this.autoRotate) this.azimuth += this.autoRotateSpeed * dt

    this._azimuth = damp(this._azimuth, this.azimuth, this.damping, dt)
    this._polar = damp(this._polar, this.polar, this.damping, dt)
    this._distance = damp(this._distance, this.distance, this.damping, dt)
    this._targetSmooth.x = damp(this._targetSmooth.x, this.target.x, this.damping, dt)
    this._targetSmooth.y = damp(this._targetSmooth.y, this.target.y, this.damping, dt)
    this._targetSmooth.z = damp(this._targetSmooth.z, this.target.z, this.damping, dt)

    const sinPolar = Math.sin(this._polar)
    this.camera.position.set(
      this._targetSmooth.x + this._distance * sinPolar * Math.sin(this._azimuth),
      this._targetSmooth.y + this._distance * Math.cos(this._polar),
      this._targetSmooth.z + this._distance * sinPolar * Math.cos(this._azimuth)
    )
    this.camera.lookAt(this._targetSmooth)
  }

  dispose() {
    const el = this.element
    el.removeEventListener("pointerdown", this._handlers.down)
    el.removeEventListener("pointermove", this._handlers.move)
    window.removeEventListener("pointerup", this._handlers.up)
    window.removeEventListener("pointercancel", this._handlers.up)
    el.removeEventListener("wheel", this._handlers.wheel)
    super.dispose()
  }
}

/**
 * Shared jump feel: coyote time (you can still jump a moment after walking off
 * a ledge) and input buffering (a jump pressed just before landing still
 * fires). Both are invisible to the player and both are why a platformer feels
 * responsive rather than fussy.
 */
class JumpControl {
  constructor({ speed = 9, coyote = 0.12, buffer = 0.12, maxJumps = 1 } = {}) {
    this.speed = speed
    this.coyote = coyote
    this.buffer = buffer
    this.maxJumps = maxJumps
    this._sinceGround = 99
    this._sincePress = 99
    this._used = 0
  }

  update(dt, body, pressed, held) {
    this._sinceGround += dt
    this._sincePress += dt
    if (body.onGround) {
      this._sinceGround = 0
      if (body.velocity.y <= 0) this._used = 0
    }
    if (pressed) this._sincePress = 0

    const grounded = this._sinceGround <= this.coyote
    const wanted = this._sincePress <= this.buffer
    const canAirJump = this._used > 0 && this._used < this.maxJumps

    let jumped = false
    if (wanted && (grounded || canAirJump)) {
      body.velocity.y = this.speed
      body.onGround = false
      this._sincePress = 99
      this._sinceGround = 99
      this._used = Math.max(1, this._used + 1)
      jumped = true
    }

    // Variable jump height: let go early and the rise is cut short.
    if (!held && body.velocity.y > 0) body.velocity.y *= 0.86
    return jumped
  }
}

export { JumpControl }

/**
 * Mouse-look + WASD, with gravity and jumping. Click the canvas to capture the
 * pointer; Escape releases it.
 */
export class FirstPersonController extends Controller {
  constructor(options = {}) {
    const { engine, ...rest } = options
    super(engine)

    const {
      world = null,
      camera = engine.camera,
      position = { x: 0, y: 2, z: 6 },
      height = 1.8,
      radius = 0.4,
      eyeHeight = 0.72, // fraction of height
      speed = 6,
      sprintMultiplier = 1.7,
      airControl = 0.35,
      acceleration = 40,
      jumpSpeed = 8,
      lookSensitivity = 0.0022,
      headBob = true,
      pointerLock = true,
      stepHeight = 0.45,
    } = rest

    this.world = world
    this.camera = camera
    this.input = engine.input
    this.speed = speed
    this.sprintMultiplier = sprintMultiplier
    this.airControl = airControl
    this.acceleration = acceleration
    this.lookSensitivity = lookSensitivity
    this.headBob = headBob
    this.eyeHeight = eyeHeight

    this.yaw = 0
    this.pitch = 0
    this._bobPhase = 0

    this.body = new Body({
      position,
      size: { x: radius * 2, y: height, z: radius * 2 },
      gravity: true,
      friction: 10,
      stepHeight,
      tag: "player",
    })
    if (world) world.addBody(this.body)

    this.jump = new JumpControl({ speed: jumpSpeed })

    if (pointerLock) {
      this._onClick = () => {
        if (this.enabled && !this.input.locked) this.input.lock()
      }
      engine.canvas.addEventListener("click", this._onClick)
    }
  }

  /** Where the player is looking, as a unit vector. */
  get forward() {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    )
  }

  update(dt) {
    const input = this.input

    // Look — only while the pointer is captured, or while dragging otherwise.
    if (input.locked || input.isDown("Mouse0")) {
      const look = input.lookVector()
      this.yaw -= look.x * this.lookSensitivity
      this.pitch = clamp(
        this.pitch - look.y * this.lookSensitivity,
        -HALF_PI + 0.01,
        HALF_PI - 0.01
      )
    }

    // Move, relative to where we are facing.
    const move = input.moveVector()
    const sprinting = input.isDown("sprint")
    const targetSpeed = this.speed * (sprinting ? this.sprintMultiplier : 1)
    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    const wishX = (move.x * cos - move.y * sin) * targetSpeed
    const wishZ = (-move.x * sin - move.y * cos) * targetSpeed

    const body = this.body
    const control = body.onGround ? 1 : this.airControl
    const rate = this.acceleration * control * dt
    body.velocity.x += (wishX - body.velocity.x) * Math.min(1, rate)
    body.velocity.z += (wishZ - body.velocity.z) * Math.min(1, rate)

    this.jump.update(dt, body, input.justPressed("jump"), input.isDown("jump"))

    // Without a physics world there is nothing to collide with, so integrate.
    if (!this.world) {
      body.position.addScaledVector(body.velocity, dt)
      if (body.position.y < body.size.y / 2) {
        body.position.y = body.size.y / 2
        body.velocity.y = 0
        body.onGround = true
      }
    }

    // Camera sits at eye height, with a subtle bob while walking.
    let bob = 0
    if (this.headBob) {
      const planarSpeed = Math.hypot(body.velocity.x, body.velocity.z)
      if (body.onGround && planarSpeed > 0.5) {
        this._bobPhase += dt * planarSpeed * 1.6
        bob = Math.sin(this._bobPhase) * 0.045
      } else {
        this._bobPhase = 0
      }
    }
    this.camera.position.set(
      body.position.x,
      body.position.y + body.size.y * (this.eyeHeight - 0.5) + bob,
      body.position.z
    )
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ")
  }

  dispose() {
    if (this._onClick) this.engine.canvas.removeEventListener("click", this._onClick)
    this.world?.removeBody(this.body)
    super.dispose()
  }
}

/**
 * Chase camera behind a character that moves in camera-relative directions and
 * turns to face where it is going. The default for adventure and action games.
 */
export class ThirdPersonController extends Controller {
  constructor(options = {}) {
    const { engine, ...rest } = options
    super(engine)

    const {
      world = null,
      camera = engine.camera,
      mesh = null,
      position = { x: 0, y: 2, z: 0 },
      size = { x: 0.8, y: 1.7, z: 0.8 },
      speed = 7,
      sprintMultiplier = 1.6,
      acceleration = 30,
      jumpSpeed = 9,
      turnSpeed = 12,
      distance = 7,
      height = 3,
      pitch = 0.32,
      lookSensitivity = 0.005,
      cameraDamping = 9,
      collideCamera = true,
      stepHeight = 0.4,
    } = rest

    this.world = world
    this.camera = camera
    this.mesh = mesh
    this.input = engine.input
    this.speed = speed
    this.sprintMultiplier = sprintMultiplier
    this.acceleration = acceleration
    this.turnSpeed = turnSpeed
    this.distance = distance
    this.height = height
    this.pitch = pitch
    this.lookSensitivity = lookSensitivity
    this.cameraDamping = cameraDamping
    this.collideCamera = collideCamera

    this.yaw = 0 // camera orbit angle
    this.facing = 0 // where the character is pointing
    this.moving = false
    this.speedRatio = 0 // 0..1, handy for blending a walk/run animation

    this.body = new Body({
      position,
      size,
      mesh,
      meshOffset: new THREE.Vector3(0, -size.y / 2, 0),
      gravity: true,
      friction: 9,
      stepHeight,
      tag: "player",
    })
    if (world) world.addBody(this.body)
    this.jump = new JumpControl({ speed: jumpSpeed })

    this._cameraPosition = new THREE.Vector3()
    this._lookTarget = new THREE.Vector3()
  }

  update(dt) {
    const input = this.input
    const body = this.body

    if (input.locked || input.isDown("Mouse0") || input.gamepadConnected) {
      const look = input.lookVector()
      this.yaw -= look.x * this.lookSensitivity
      this.pitch = clamp(
        this.pitch + look.y * this.lookSensitivity,
        -0.2,
        1.25
      )
    }

    const move = input.moveVector()
    const sprinting = input.isDown("sprint")
    const targetSpeed = this.speed * (sprinting ? this.sprintMultiplier : 1)

    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    const wishX = (move.x * cos - move.y * sin) * targetSpeed
    const wishZ = (-move.x * sin - move.y * cos) * targetSpeed

    this.moving = Math.hypot(move.x, move.y) > 0.05
    const rate = Math.min(1, this.acceleration * dt * (body.onGround ? 1 : 0.4))
    body.velocity.x += (wishX - body.velocity.x) * rate
    body.velocity.z += (wishZ - body.velocity.z) * rate

    this.jump.update(dt, body, input.justPressed("jump"), input.isDown("jump"))

    if (!this.world) {
      body.position.addScaledVector(body.velocity, dt)
      if (body.position.y < body.size.y / 2) {
        body.position.y = body.size.y / 2
        body.velocity.y = 0
        body.onGround = true
      }
      body.syncMesh()
    }

    const planarSpeed = Math.hypot(body.velocity.x, body.velocity.z)
    this.speedRatio = Math.min(1, planarSpeed / Math.max(0.001, targetSpeed))

    // Turn the character toward travel, taking the shortest way round.
    if (this.moving) {
      const desired = Math.atan2(body.velocity.x, body.velocity.z)
      this.facing = dampAngle(this.facing, desired, this.turnSpeed, dt)
      if (this.mesh) this.mesh.rotation.y = this.facing
    }

    this._updateCamera(dt)
  }

  _updateCamera(dt) {
    const body = this.body
    this._lookTarget.set(
      body.position.x,
      body.position.y + body.size.y * 0.35,
      body.position.z
    )

    const horizontal = Math.cos(this.pitch) * this.distance
    const desired = new THREE.Vector3(
      this._lookTarget.x + Math.sin(this.yaw) * horizontal,
      this._lookTarget.y + this.height + Math.sin(this.pitch) * this.distance,
      this._lookTarget.z + Math.cos(this.yaw) * horizontal
    )

    // Pull the camera in when a wall would otherwise be between it and the
    // player — the cheapest fix for "the camera went inside the scenery".
    if (this.collideCamera && this.world) {
      const toCamera = new THREE.Vector3().subVectors(desired, this._lookTarget)
      const length = toCamera.length()
      const hit = this.world.raycast(this._lookTarget, toCamera, length)
      if (hit) {
        desired
          .copy(this._lookTarget)
          .addScaledVector(toCamera.normalize(), Math.max(1, hit.distance - 0.3))
      }
    }

    this._cameraPosition.copy(this.camera.position)
    this._cameraPosition.x = damp(this._cameraPosition.x, desired.x, this.cameraDamping, dt)
    this._cameraPosition.y = damp(this._cameraPosition.y, desired.y, this.cameraDamping, dt)
    this._cameraPosition.z = damp(this._cameraPosition.z, desired.z, this.cameraDamping, dt)
    this.camera.position.copy(this._cameraPosition)
    this.camera.lookAt(this._lookTarget)
  }

  dispose() {
    this.world?.removeBody(this.body)
    super.dispose()
  }
}

/**
 * Overhead camera and world-space movement — twin-stick shooters, dungeon
 * crawlers, strategy games. Set `faceCursor` for aim-with-the-mouse control.
 */
export class TopDownController extends Controller {
  constructor(options = {}) {
    const { engine, ...rest } = options
    super(engine)

    const {
      world = null,
      camera = engine.camera,
      mesh = null,
      position = { x: 0, y: 0.6, z: 0 },
      size = { x: 0.9, y: 1.2, z: 0.9 },
      speed = 8,
      acceleration = 45,
      height = 16,
      angle = 0.95, // radians from vertical; 0 is straight down
      damping = 8,
      faceCursor = false,
      turnSpeed = 14,
      gravity = false,
    } = rest

    this.world = world
    this.camera = camera
    this.mesh = mesh
    this.input = engine.input
    this.speed = speed
    this.acceleration = acceleration
    this.height = height
    this.angle = angle
    this.damping = damping
    this.faceCursor = faceCursor
    this.turnSpeed = turnSpeed
    this.facing = 0
    this.moving = false

    this.body = new Body({
      position,
      size,
      mesh,
      meshOffset: new THREE.Vector3(0, -size.y / 2, 0),
      gravity,
      friction: 12,
      tag: "player",
    })
    if (world) world.addBody(this.body)
  }

  update(dt) {
    const input = this.input
    const body = this.body
    const move = input.moveVector()

    // Screen up is world -Z, so the stick maps straight onto the ground plane.
    const wishX = move.x * this.speed
    const wishZ = -move.y * this.speed
    const rate = Math.min(1, this.acceleration * dt)
    body.velocity.x += (wishX - body.velocity.x) * rate
    body.velocity.z += (wishZ - body.velocity.z) * rate
    this.moving = Math.hypot(move.x, move.y) > 0.05

    if (!this.world) {
      body.position.addScaledVector(body.velocity, dt)
      body.syncMesh()
    }

    let desired = this.facing
    if (this.faceCursor) {
      const ground = this.engine.pointerOnGround(body.position.y)
      if (ground) {
        desired = Math.atan2(
          ground.x - body.position.x,
          ground.z - body.position.z
        )
      }
    } else if (this.moving) {
      desired = Math.atan2(body.velocity.x, body.velocity.z)
    }
    this.facing = dampAngle(this.facing, desired, this.turnSpeed, dt)
    if (this.mesh) this.mesh.rotation.y = this.facing

    const targetX = body.position.x
    const targetZ = body.position.z + Math.sin(this.angle) * this.height * 0.5
    this.camera.position.x = damp(this.camera.position.x, targetX, this.damping, dt)
    this.camera.position.y = damp(this.camera.position.y, body.position.y + this.height, this.damping, dt)
    this.camera.position.z = damp(this.camera.position.z, targetZ, this.damping, dt)
    this.camera.lookAt(body.position.x, body.position.y, body.position.z)
  }

  dispose() {
    this.world?.removeBody(this.body)
    super.dispose()
  }
}

/**
 * Side-on movement in the XY plane with a camera that follows on X (and, with
 * `followY`, on Y too). Z stays fixed, so a 3D scene plays as a platformer.
 */
export class PlatformerController extends Controller {
  constructor(options = {}) {
    const { engine, ...rest } = options
    super(engine)

    const {
      world = null,
      camera = engine.camera,
      mesh = null,
      position = { x: 0, y: 2, z: 0 },
      size = { x: 0.8, y: 1.3, z: 0.8 },
      speed = 7,
      acceleration = 60,
      airAcceleration = 25,
      jumpSpeed = 11,
      maxJumps = 1,
      distance = 14,
      cameraHeight = 2,
      damping = 6,
      followY = false,
      faceDirection = true,
    } = rest

    this.world = world
    this.camera = camera
    this.mesh = mesh
    this.input = engine.input
    this.speed = speed
    this.acceleration = acceleration
    this.airAcceleration = airAcceleration
    this.distance = distance
    this.cameraHeight = cameraHeight
    this.damping = damping
    this.followY = followY
    this.faceDirection = faceDirection
    this.direction = 1 // 1 right, -1 left

    this.body = new Body({
      position,
      size,
      mesh,
      meshOffset: new THREE.Vector3(0, -size.y / 2, 0),
      gravity: true,
      friction: 14,
      stepHeight: 0.3,
      tag: "player",
    })
    if (world) world.addBody(this.body)
    this.jump = new JumpControl({ speed: jumpSpeed, maxJumps })
  }

  update(dt) {
    const input = this.input
    const body = this.body
    const move = input.moveVector(false)

    const wishX = move.x * this.speed
    const accel = body.onGround ? this.acceleration : this.airAcceleration
    body.velocity.x += (wishX - body.velocity.x) * Math.min(1, accel * dt)
    body.velocity.z = 0
    body.position.z = 0

    this.jump.update(dt, body, input.justPressed("jump"), input.isDown("jump"))

    if (!this.world) {
      body.position.addScaledVector(body.velocity, dt)
      if (body.position.y < body.size.y / 2) {
        body.position.y = body.size.y / 2
        body.velocity.y = 0
        body.onGround = true
      }
      body.syncMesh()
    }

    if (this.faceDirection && Math.abs(move.x) > 0.05) {
      this.direction = move.x > 0 ? 1 : -1
      if (this.mesh) {
        this.mesh.rotation.y = dampAngle(
          this.mesh.rotation.y,
          this.direction > 0 ? HALF_PI : -HALF_PI,
          14,
          dt
        )
      }
    }

    this.camera.position.x = damp(this.camera.position.x, body.position.x, this.damping, dt)
    const targetY = this.followY
      ? body.position.y + this.cameraHeight
      : this.cameraHeight
    this.camera.position.y = damp(this.camera.position.y, targetY, this.damping * 0.6, dt)
    this.camera.position.z = this.distance
    this.camera.lookAt(this.camera.position.x, this.camera.position.y - this.cameraHeight * 0.3, 0)
  }

  dispose() {
    this.world?.removeBody(this.body)
    super.dispose()
  }
}

/**
 * Arcade driving: throttle, brake and a steering rate that tightens with speed.
 * Not a real vehicle simulation — it is the "kart" feel, which is what almost
 * every browser driving game actually wants.
 */
export class VehicleController extends Controller {
  constructor(options = {}) {
    const { engine, ...rest } = options
    super(engine)

    const {
      world = null,
      camera = engine.camera,
      mesh = null,
      position = { x: 0, y: 0.6, z: 0 },
      size = { x: 1.8, y: 1, z: 3.4 },
      maxSpeed = 28,
      reverseSpeed = 9,
      accelerationRate = 14,
      brakeRate = 26,
      dragRate = 3,
      steerRate = 1.9,
      grip = 0.92,
      followCamera = true,
      cameraDistance = 9,
      cameraHeight = 4,
      cameraDamping = 5,
    } = rest

    this.world = world
    this.camera = camera
    this.mesh = mesh
    this.input = engine.input
    this.maxSpeed = maxSpeed
    this.reverseSpeed = reverseSpeed
    this.accelerationRate = accelerationRate
    this.brakeRate = brakeRate
    this.dragRate = dragRate
    this.steerRate = steerRate
    this.grip = grip
    this.followCamera = followCamera
    this.cameraDistance = cameraDistance
    this.cameraHeight = cameraHeight
    this.cameraDamping = cameraDamping

    this.speed = 0
    this.heading = 0

    this.body = new Body({
      position,
      size,
      mesh,
      meshOffset: new THREE.Vector3(0, -size.y / 2, 0),
      gravity: true,
      tag: "vehicle",
    })
    if (world) world.addBody(this.body)
  }

  update(dt) {
    const input = this.input
    const body = this.body
    const move = input.moveVector(false)
    const throttle = move.y
    const steer = -move.x

    if (throttle > 0) {
      this.speed += this.accelerationRate * throttle * dt
    } else if (throttle < 0) {
      this.speed +=
        (this.speed > 0 ? this.brakeRate : this.accelerationRate) * throttle * dt
    } else {
      // Coast back toward a stop.
      const drag = this.dragRate * dt
      this.speed = Math.abs(this.speed) <= drag ? 0 : this.speed - Math.sign(this.speed) * drag
    }
    this.speed = clamp(this.speed, -this.reverseSpeed, this.maxSpeed)

    // Steering authority falls away at a standstill, as it does in a real car.
    const authority = Math.min(1, Math.abs(this.speed) / 6)
    this.heading += steer * this.steerRate * authority * dt * Math.sign(this.speed || 1)
    if (this.mesh) this.mesh.rotation.y = this.heading

    const forwardX = Math.sin(this.heading)
    const forwardZ = Math.cos(this.heading)
    const targetX = forwardX * this.speed
    const targetZ = forwardZ * this.speed
    body.velocity.x += (targetX - body.velocity.x) * Math.min(1, this.grip * 12 * dt)
    body.velocity.z += (targetZ - body.velocity.z) * Math.min(1, this.grip * 12 * dt)

    if (!this.world) {
      body.position.addScaledVector(body.velocity, dt)
      if (body.position.y < body.size.y / 2) {
        body.position.y = body.size.y / 2
        body.velocity.y = 0
        body.onGround = true
      }
      body.syncMesh()
    }

    if (this.followCamera) {
      const desiredX = body.position.x - forwardX * this.cameraDistance
      const desiredZ = body.position.z - forwardZ * this.cameraDistance
      this.camera.position.x = damp(this.camera.position.x, desiredX, this.cameraDamping, dt)
      this.camera.position.y = damp(this.camera.position.y, body.position.y + this.cameraHeight, this.cameraDamping, dt)
      this.camera.position.z = damp(this.camera.position.z, desiredZ, this.cameraDamping, dt)
      this.camera.lookAt(body.position.x, body.position.y + 1, body.position.z)
    }
  }

  dispose() {
    this.world?.removeBody(this.body)
    super.dispose()
  }
}

/**
 * A camera that simply follows any object with a fixed offset and damping.
 * Use it when you drive the character yourself and only want the camera solved.
 */
export class FollowCamera extends Controller {
  constructor(options = {}) {
    const { engine, ...rest } = options
    super(engine, { fixed: false })

    const {
      camera = engine.camera,
      target,
      offset = { x: 0, y: 6, z: 10 },
      lookOffset = { x: 0, y: 1, z: 0 },
      damping = 6,
      rotateWithTarget = false,
    } = rest

    this.camera = camera
    this.target = target
    this.offset = new THREE.Vector3(offset.x, offset.y, offset.z)
    this.lookOffset = new THREE.Vector3(lookOffset.x, lookOffset.y, lookOffset.z)
    this.damping = damping
    this.rotateWithTarget = rotateWithTarget
    this._desired = new THREE.Vector3()
    this._look = new THREE.Vector3()
  }

  update(dt) {
    if (!this.target) return
    const position = this.target.position || this.target

    this._desired.copy(this.offset)
    if (this.rotateWithTarget && this.target.quaternion) {
      this._desired.applyQuaternion(this.target.quaternion)
    }
    this._desired.add(position)

    this.camera.position.x = damp(this.camera.position.x, this._desired.x, this.damping, dt)
    this.camera.position.y = damp(this.camera.position.y, this._desired.y, this.damping, dt)
    this.camera.position.z = damp(this.camera.position.z, this._desired.z, this.damping, dt)

    this._look.copy(position).add(this.lookOffset)
    this.camera.lookAt(this._look)
  }
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value
}

export { UP }
