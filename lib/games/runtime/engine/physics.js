/*
  Axis-aligned collision, gravity and character movement.

  This is deliberately not a rigid-body simulator. Nearly every browser game
  wants the same thing — a box that walks around a world of other boxes without
  falling through them — and that is what this does, with no dependency and no
  tuning. Bodies are axis-aligned boxes; the world is a set of static boxes in a
  spatial hash; movement resolves one axis at a time, which is what produces the
  familiar "slide along the wall" feel.

  Use it from `engine.onFixed`, never from `onUpdate`, so collision behaves the
  same on a 30 Hz phone and a 144 Hz monitor.
*/

import * as THREE from "./three.js"

/** Axis-aligned box, stored as min/max corners. */
export class Box {
  constructor(min = new THREE.Vector3(), max = new THREE.Vector3()) {
    this.min = min.clone()
    this.max = max.clone()
  }

  static fromCenterSize(center, size) {
    const half = new THREE.Vector3(size.x / 2, size.y / 2, size.z / 2)
    return new Box(
      new THREE.Vector3().copy(center).sub(half),
      new THREE.Vector3().copy(center).add(half)
    )
  }

  /** World-space bounds of any Object3D, after its transforms. */
  static fromObject(object) {
    const box3 = new THREE.Box3().setFromObject(object)
    return new Box(box3.min, box3.max)
  }

  get center() {
    return new THREE.Vector3()
      .addVectors(this.min, this.max)
      .multiplyScalar(0.5)
  }

  get size() {
    return new THREE.Vector3().subVectors(this.max, this.min)
  }

  setCenter(center) {
    const half = this.size.multiplyScalar(0.5)
    this.min.copy(center).sub(half)
    this.max.copy(center).add(half)
    return this
  }

  intersects(other) {
    return (
      this.min.x < other.max.x &&
      this.max.x > other.min.x &&
      this.min.y < other.max.y &&
      this.max.y > other.min.y &&
      this.min.z < other.max.z &&
      this.max.z > other.min.z
    )
  }

  containsPoint(point) {
    return (
      point.x >= this.min.x &&
      point.x <= this.max.x &&
      point.y >= this.min.y &&
      point.y <= this.max.y &&
      point.z >= this.min.z &&
      point.z <= this.max.z
    )
  }

  expand(amount) {
    this.min.subScalar(amount)
    this.max.addScalar(amount)
    return this
  }

  clone() {
    return new Box(this.min, this.max)
  }
}

/** A static (or manually moved) piece of level geometry. */
export class Collider {
  constructor(box, { isTrigger = false, tag = "", userData = null } = {}) {
    this.box = box
    this.isTrigger = isTrigger
    this.tag = tag
    this.userData = userData
    this.enabled = true
    this._cells = []
  }
}

/** A moving box: the player, an enemy, a crate, a projectile. */
export class Body {
  /**
   * @param {object} [options]
   * @param {THREE.Vector3|object} [options.position]
   * @param {THREE.Vector3|object} [options.size] full width/height/depth
   * @param {THREE.Object3D} [options.mesh] kept in sync with the body each step
   * @param {THREE.Vector3} [options.meshOffset] mesh offset from body centre
   * @param {boolean} [options.gravity] (default true)
   * @param {number} [options.stepHeight] auto-climb ledges up to this tall
   * @param {number} [options.friction] ground damping per second (0 = none)
   * @param {number} [options.bounce] 0 stops dead, 1 bounces perfectly
   */
  constructor(options = {}) {
    const {
      position = { x: 0, y: 0, z: 0 },
      size = { x: 1, y: 1, z: 1 },
      mesh = null,
      meshOffset = null,
      gravity = true,
      stepHeight = 0,
      friction = 0,
      bounce = 0,
      tag = "",
      userData = null,
    } = options

    this.position = new THREE.Vector3(position.x, position.y, position.z)
    this.velocity = new THREE.Vector3()
    this.size = new THREE.Vector3(size.x, size.y, size.z)
    this.mesh = mesh
    this.meshOffset = meshOffset ? meshOffset.clone() : new THREE.Vector3()
    this.useGravity = gravity
    this.stepHeight = stepHeight
    this.friction = friction
    this.bounce = bounce
    this.tag = tag
    this.userData = userData

    this.onGround = false
    this.hitWall = false
    this.hitCeiling = false
    this.enabled = true
    this.box = Box.fromCenterSize(this.position, this.size)
    this._triggers = new Set()
  }

  /** Teleport without any collision resolution. */
  setPosition(x, y, z) {
    this.position.set(x, y, z)
    this.velocity.set(0, 0, 0)
    this.syncMesh()
    return this
  }

  syncMesh() {
    if (this.mesh) {
      this.mesh.position.copy(this.position).add(this.meshOffset)
    }
  }

  get bottom() {
    return this.position.y - this.size.y / 2
  }
}

// Uniform grid over the XZ plane. Levels are wide and short, so hashing two
// axes is enough to keep the per-step collider list tiny.
class SpatialHash {
  constructor(cellSize = 4) {
    this.cellSize = cellSize
    this.cells = new Map()
  }

  _key(ix, iz) {
    return `${ix}|${iz}`
  }

  _range(box) {
    return {
      x0: Math.floor(box.min.x / this.cellSize),
      x1: Math.floor(box.max.x / this.cellSize),
      z0: Math.floor(box.min.z / this.cellSize),
      z1: Math.floor(box.max.z / this.cellSize),
    }
  }

  insert(collider) {
    const { x0, x1, z0, z1 } = this._range(collider.box)
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const key = this._key(ix, iz)
        let bucket = this.cells.get(key)
        if (!bucket) {
          bucket = []
          this.cells.set(key, bucket)
        }
        bucket.push(collider)
        collider._cells.push(key)
      }
    }
  }

  remove(collider) {
    for (const key of collider._cells) {
      const bucket = this.cells.get(key)
      if (!bucket) continue
      const index = bucket.indexOf(collider)
      if (index !== -1) bucket.splice(index, 1)
      if (bucket.length === 0) this.cells.delete(key)
    }
    collider._cells.length = 0
  }

  /** Every collider whose cell overlaps `box`, de-duplicated. */
  query(box, out = []) {
    out.length = 0
    const { x0, x1, z0, z1 } = this._range(box)
    const seen = new Set()
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const bucket = this.cells.get(this._key(ix, iz))
        if (!bucket) continue
        for (const collider of bucket) {
          if (seen.has(collider)) continue
          seen.add(collider)
          out.push(collider)
        }
      }
    }
    return out
  }

  clear() {
    this.cells.clear()
  }
}

export { SpatialHash }

export class PhysicsWorld {
  /**
   * @param {object} [options]
   * @param {number} [options.gravity] downward acceleration (default -24, which
   *   feels better in games than real-world -9.81)
   * @param {number} [options.cellSize] broadphase grid size; set it near your
   *   typical collider size
   */
  constructor({ gravity = -24, cellSize = 4 } = {}) {
    this.gravity = gravity
    this.statics = new SpatialHash(cellSize)
    this.colliders = []
    this.bodies = []
    this._candidates = []
    this._box = new Box()
    this._onTriggerEnter = []
    this._onTriggerExit = []
  }

  // --- level geometry -------------------------------------------------------

  /** Adds a static box collider, by centre and full size. */
  addBox(center, size, options = {}) {
    const collider = new Collider(Box.fromCenterSize(center, size), options)
    this.colliders.push(collider)
    this.statics.insert(collider)
    return collider
  }

  /**
   * Adds a collider matching an object's world bounding box. Pass any mesh you
   * placed in the scene and it becomes solid — the usual way to build a level.
   */
  addObject(object, options = {}) {
    object.updateWorldMatrix(true, true)
    const collider = new Collider(Box.fromObject(object), {
      userData: object,
      ...options,
    })
    this.colliders.push(collider)
    this.statics.insert(collider)
    return collider
  }

  /**
   * Adds one collider per mesh under `root`. Use `filter` to skip decoration:
   * `world.addObjects(level, { filter: (m) => m.userData.solid !== false })`
   */
  addObjects(root, { filter = null, ...options } = {}) {
    const added = []
    root.updateWorldMatrix(true, true)
    root.traverse((child) => {
      if (!child.isMesh) return
      if (filter && !filter(child)) return
      added.push(this.addObject(child, options))
    })
    return added
  }

  /** A non-solid volume that reports bodies entering and leaving it. */
  addTrigger(center, size, options = {}) {
    return this.addBox(center, size, { ...options, isTrigger: true })
  }

  removeCollider(collider) {
    this.statics.remove(collider)
    const index = this.colliders.indexOf(collider)
    if (index !== -1) this.colliders.splice(index, 1)
  }

  /** Moves a static collider (a lift, a swinging platform) and re-indexes it. */
  moveCollider(collider, center) {
    this.statics.remove(collider)
    collider.box.setCenter(center)
    this.statics.insert(collider)
  }

  clearColliders() {
    this.statics.clear()
    for (const collider of this.colliders) collider._cells.length = 0
    this.colliders.length = 0
  }

  // --- bodies ---------------------------------------------------------------

  addBody(bodyOrOptions) {
    const body =
      bodyOrOptions instanceof Body ? bodyOrOptions : new Body(bodyOrOptions)
    this.bodies.push(body)
    return body
  }

  removeBody(body) {
    const index = this.bodies.indexOf(body)
    if (index !== -1) this.bodies.splice(index, 1)
  }

  /** `fn(body, collider)` when a body first overlaps a trigger volume. */
  onTriggerEnter(fn) {
    this._onTriggerEnter.push(fn)
    return () => {
      const i = this._onTriggerEnter.indexOf(fn)
      if (i !== -1) this._onTriggerEnter.splice(i, 1)
    }
  }

  onTriggerExit(fn) {
    this._onTriggerExit.push(fn)
    return () => {
      const i = this._onTriggerExit.indexOf(fn)
      if (i !== -1) this._onTriggerExit.splice(i, 1)
    }
  }

  // --- simulation -----------------------------------------------------------

  /** Advances every body by `dt` seconds. Call from `engine.onFixed`. */
  step(dt) {
    for (const body of this.bodies) {
      if (!body.enabled) continue
      this.moveBody(body, dt)
    }
  }

  moveBody(body, dt) {
    if (body.useGravity) body.velocity.y += this.gravity * dt

    body.hitWall = false
    body.hitCeiling = false
    const wasOnGround = body.onGround
    body.onGround = false

    // Resolving one axis at a time is what gives sliding: being stopped by a
    // wall in X leaves the Z component of the move intact.
    this._moveAxis(body, "x", body.velocity.x * dt, wasOnGround)
    this._moveAxis(body, "z", body.velocity.z * dt, wasOnGround)
    this._moveAxis(body, "y", body.velocity.y * dt, wasOnGround)

    if (body.onGround && body.friction > 0) {
      const damping = Math.max(0, 1 - body.friction * dt)
      body.velocity.x *= damping
      body.velocity.z *= damping
    }

    this._updateTriggers(body)
    body.syncMesh()
  }

  _moveAxis(body, axis, amount, wasOnGround) {
    if (amount === 0) return
    body.position[axis] += amount
    body.box.setCenter(body.position)

    const candidates = this.statics.query(body.box, this._candidates)
    for (const collider of candidates) {
      if (!collider.enabled || collider.isTrigger) continue
      if (!body.box.intersects(collider.box)) continue

      // Push the body back out along the axis it moved on.
      if (amount > 0) {
        body.position[axis] -=
          body.box.max[axis] - collider.box.min[axis]
      } else {
        body.position[axis] +=
          collider.box.max[axis] - body.box.min[axis]
      }
      body.box.setCenter(body.position)

      if (axis === "y") {
        if (amount < 0) body.onGround = true
        else body.hitCeiling = true
        body.velocity.y = body.bounce > 0 ? -body.velocity.y * body.bounce : 0
        if (Math.abs(body.velocity.y) < 0.5) body.velocity.y = 0
      } else {
        // Stairs and kerbs: if the obstruction is short enough and the body was
        // walking, lift it over instead of stopping it dead.
        if (
          body.stepHeight > 0 &&
          (wasOnGround || body.onGround) &&
          this._tryStep(body, axis, amount, collider)
        ) {
          continue
        }
        body.hitWall = true
        body.velocity[axis] =
          body.bounce > 0 ? -body.velocity[axis] * body.bounce : 0
      }
    }
  }

  _tryStep(body, axis, amount, collider) {
    const rise = collider.box.max.y - body.box.min.y
    if (rise <= 0 || rise > body.stepHeight) return false

    const originalY = body.position.y
    const originalAxis = body.position[axis]

    body.position.y += rise + 0.001
    body.position[axis] = originalAxis + amount
    body.box.setCenter(body.position)

    const candidates = this.statics.query(body.box, [])
    for (const other of candidates) {
      if (!other.enabled || other.isTrigger) continue
      if (body.box.intersects(other.box)) {
        body.position.y = originalY
        body.position[axis] = originalAxis
        body.box.setCenter(body.position)
        return false
      }
    }
    body.onGround = true
    return true
  }

  _updateTriggers(body) {
    const candidates = this.statics.query(body.box, [])
    const current = new Set()
    for (const collider of candidates) {
      if (!collider.enabled || !collider.isTrigger) continue
      if (!body.box.intersects(collider.box)) continue
      current.add(collider)
      if (!body._triggers.has(collider)) {
        for (const fn of this._onTriggerEnter) fn(body, collider)
      }
    }
    for (const collider of body._triggers) {
      if (!current.has(collider)) {
        for (const fn of this._onTriggerExit) fn(body, collider)
      }
    }
    body._triggers = current
  }

  // --- queries --------------------------------------------------------------

  /**
   * Ray against every static collider (slab test).
   * @returns {{distance:number, point:THREE.Vector3, collider:Collider}|null}
   */
  raycast(origin, direction, maxDistance = Infinity, filter = null) {
    const dir = direction.clone().normalize()
    let best = null

    // A ray is thin, so sweep the grid with the ray's own bounding box.
    const end = origin.clone().addScaledVector(
      dir,
      Number.isFinite(maxDistance) ? maxDistance : 1000
    )
    const sweep = new Box(
      new THREE.Vector3(
        Math.min(origin.x, end.x),
        Math.min(origin.y, end.y),
        Math.min(origin.z, end.z)
      ),
      new THREE.Vector3(
        Math.max(origin.x, end.x),
        Math.max(origin.y, end.y),
        Math.max(origin.z, end.z)
      )
    )

    for (const collider of this.statics.query(sweep, [])) {
      if (!collider.enabled || collider.isTrigger) continue
      if (filter && !filter(collider)) continue
      const distance = rayBox(origin, dir, collider.box)
      if (distance === null || distance > maxDistance) continue
      if (!best || distance < best.distance) {
        best = {
          distance,
          point: origin.clone().addScaledVector(dir, distance),
          collider,
        }
      }
    }
    return best
  }

  /** Height of the highest solid surface below (x, y, z). */
  groundHeight(x, z, fromY = 200, filter = null) {
    const hit = this.raycast(
      new THREE.Vector3(x, fromY, z),
      DOWN,
      Infinity,
      filter
    )
    return hit ? hit.point.y : -Infinity
  }

  /** Every static collider overlapping a box — "what is in this room?". */
  queryBox(box) {
    return this.statics
      .query(box, [])
      .filter((collider) => collider.enabled && box.intersects(collider.box))
  }

  /** Other bodies this body currently overlaps. */
  overlappingBodies(body, filter = null) {
    const hits = []
    for (const other of this.bodies) {
      if (other === body || !other.enabled) continue
      if (filter && !filter(other)) continue
      if (body.box.intersects(other.box)) hits.push(other)
    }
    return hits
  }

  /** Wireframe boxes for every collider — invaluable when movement feels wrong. */
  debugMesh(color = 0x4ade80) {
    const group = new THREE.Group()
    group.name = "physics-debug"
    const material = new THREE.LineBasicMaterial({ color })
    for (const collider of this.colliders) {
      const size = collider.box.size
      const geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
      const lines = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        material
      )
      lines.position.copy(collider.box.center)
      group.add(lines)
      geometry.dispose()
    }
    return group
  }
}

const DOWN = new THREE.Vector3(0, -1, 0)

/** Ray/box slab test. Returns the entry distance, or null when it misses. */
export function rayBox(origin, direction, box) {
  let tmin = 0
  let tmax = Infinity
  for (const axis of ["x", "y", "z"]) {
    const d = direction[axis]
    if (Math.abs(d) < 1e-8) {
      if (origin[axis] < box.min[axis] || origin[axis] > box.max[axis]) {
        return null
      }
      continue
    }
    const inv = 1 / d
    let t1 = (box.min[axis] - origin[axis]) * inv
    let t2 = (box.max[axis] - origin[axis]) * inv
    if (t1 > t2) {
      const tmp = t1
      t1 = t2
      t2 = tmp
    }
    tmin = Math.max(tmin, t1)
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return null
  }
  return tmin
}

// --- cheap standalone tests, for bullets, pickups and enemy sight ------------

export function spheresOverlap(a, radiusA, b, radiusB) {
  const r = radiusA + radiusB
  return a.distanceToSquared(b) <= r * r
}

/** Distance ignoring height — the right check for most top-down logic. */
export function distanceXZ(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** True when `target` is within `range` and inside a `fovDegrees` cone. */
export function canSee(origin, forward, target, range, fovDegrees = 90) {
  const to = new THREE.Vector3().subVectors(target, origin)
  const distance = to.length()
  if (distance > range || distance === 0) return false
  to.divideScalar(distance)
  const cos = to.dot(forward.clone().normalize())
  return cos >= Math.cos((fovDegrees * Math.PI) / 360)
}
