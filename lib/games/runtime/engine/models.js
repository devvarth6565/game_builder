/*
  Procedural models: characters, props, scenery and vehicles built from
  primitives at runtime.

  Nothing here loads a file. A generated game has no art pipeline and no assets
  to ship, so the fastest route to something that looks intentional is a small
  set of chunky, flat-shaded shapes drawn from one palette. Every builder
  returns a THREE.Group whose origin sits on the ground, so `mesh.position.y =
  0` puts it on the floor.

  Characters also carry `group.rig`, the named joints that
  `animation.animateCharacter()` drives.
*/

import * as THREE from "./three.js"

import { PALETTE, solid, smooth, glow, unlit } from "./materials.js"

/** Box mesh with its origin at the centre. */
export function box(width, height, depth, color = PALETTE.brand, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    options.material || solid(color, options)
  )
  mesh.castShadow = options.castShadow ?? true
  mesh.receiveShadow = options.receiveShadow ?? true
  return mesh
}

export function cylinder(radiusTop, radiusBottom, height, color, options = {}) {
  const { segments = 10, ...rest } = options
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    options.material || solid(color, rest)
  )
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Faceted sphere — cheaper and better-looking than a smooth one at this style. */
export function ball(radius, color, options = {}) {
  const { detail = 1, flat = true, ...rest } = options
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius, detail),
    options.material || (flat ? solid(color, rest) : smooth(color, rest))
  )
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

export function cone(radius, height, color, options = {}) {
  const { segments = 8 } = options
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(radius, height, segments),
    options.material || solid(color, options)
  )
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

// Limbs rotate around a joint, so each one is a pivot Group with the visible
// box hanging below it. Setting `limb.rotation.x` then swings from the
// shoulder or hip, which is what makes the walk cycle read correctly.
function limb(width, length, depth, color, { pivotY = 0 } = {}) {
  const pivot = new THREE.Group()
  const mesh = box(width, length, depth, color)
  mesh.position.y = -length / 2
  pivot.add(mesh)
  pivot.position.y = pivotY
  pivot.userData.length = length
  return pivot
}

/**
 * A blocky humanoid, about 1.8 units tall by default.
 *
 * @param {object} [options] skin, shirt, pants, shoes, height, and `hat` to add
 *   a simple cap for a bit of character
 * @returns {THREE.Group} with `.rig` = {root, torso, head, leftArm, rightArm,
 *   leftLeg, rightLeg}
 */
export function character(options = {}) {
  const {
    skin = "#f3c19a",
    shirt = PALETTE.brand,
    pants = PALETTE.slate,
    shoes = PALETTE.charcoal,
    hair = PALETTE.rust,
    height = 1.8,
    hat = false,
  } = options

  const unit = height / 1.8
  const group = new THREE.Group()

  const legLength = 0.72 * unit
  const torsoHeight = 0.62 * unit
  const headSize = 0.4 * unit
  const hipY = legLength
  const shoulderY = hipY + torsoHeight * 0.86

  const torso = box(0.56 * unit, torsoHeight, 0.32 * unit, shirt)
  torso.position.y = hipY + torsoHeight / 2
  torso.userData.baseY = torso.position.y

  const head = box(headSize, headSize, headSize * 0.9, skin)
  head.position.y = hipY + torsoHeight + headSize / 2

  const hairMesh = box(headSize * 1.04, headSize * 0.28, headSize * 0.96, hat ? shirt : hair)
  hairMesh.position.y = headSize * 0.42
  head.add(hairMesh)
  if (hat) {
    const brim = box(headSize * 1.5, headSize * 0.1, headSize * 1.3, shirt)
    brim.position.y = headSize * 0.32
    head.add(brim)
  }

  const armLength = 0.6 * unit
  const leftArm = limb(0.16 * unit, armLength, 0.18 * unit, shirt, { pivotY: shoulderY })
  leftArm.position.x = -0.36 * unit
  const rightArm = limb(0.16 * unit, armLength, 0.18 * unit, shirt, { pivotY: shoulderY })
  rightArm.position.x = 0.36 * unit

  const leftLeg = limb(0.2 * unit, legLength, 0.22 * unit, pants, { pivotY: hipY })
  leftLeg.position.x = -0.14 * unit
  const rightLeg = limb(0.2 * unit, legLength, 0.22 * unit, pants, { pivotY: hipY })
  rightLeg.position.x = 0.14 * unit

  for (const leg of [leftLeg, rightLeg]) {
    const foot = box(0.22 * unit, 0.12 * unit, 0.3 * unit, shoes)
    foot.position.set(0, -legLength + 0.06 * unit, 0.05 * unit)
    leg.add(foot)
  }

  group.add(torso, head, leftArm, rightArm, leftLeg, rightLeg)
  group.rig = { root: group, torso, head, leftArm, rightArm, leftLeg, rightLeg }
  group.userData.height = height
  return group
}

/** A bouncing blob enemy — no rig, animate it with `pulse` and `squashStretch`. */
export function slime(options = {}) {
  const { color = PALETTE.leaf, size = 0.9, eyes = true } = options
  const group = new THREE.Group()

  const body = ball(size / 2, color, { detail: 1 })
  body.scale.y = 0.8
  body.position.y = (size / 2) * 0.8
  group.add(body)

  if (eyes) {
    for (const side of [-1, 1]) {
      const eye = ball(size * 0.08, PALETTE.white, { detail: 1, flat: false })
      eye.position.set(side * size * 0.15, size * 0.45, size * 0.38)
      group.add(eye)
      const pupil = ball(size * 0.04, PALETTE.ink, { detail: 0, flat: false })
      pupil.position.set(side * size * 0.15, size * 0.45, size * 0.44)
      group.add(pupil)
    }
  }
  group.userData.body = body
  return group
}

/** A hovering drone or eyeball enemy. */
export function drone(options = {}) {
  const { color = PALETTE.slate, accent = PALETTE.berry, size = 0.8 } = options
  const group = new THREE.Group()
  const body = ball(size / 2, color, { detail: 1 })
  const eye = ball(size * 0.22, accent, { detail: 1, flat: false, material: glow(accent, 1.4) })
  eye.position.z = size * 0.34
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(size * 0.6, size * 0.05, 6, 16),
    solid(accent)
  )
  ring.rotation.x = Math.PI / 2
  group.add(body, eye, ring)
  group.userData.ring = ring
  group.userData.eye = eye
  return group
}

// --- scenery ----------------------------------------------------------------

/** Rounded broadleaf tree. */
export function tree(options = {}) {
  const {
    trunk = PALETTE.clay,
    leaves = PALETTE.moss,
    height = 4,
    seedOffset = 0,
  } = options
  const group = new THREE.Group()

  const trunkHeight = height * 0.42
  const stem = cylinder(height * 0.06, height * 0.09, trunkHeight, trunk, { segments: 6 })
  stem.position.y = trunkHeight / 2
  group.add(stem)

  // Three overlapping blobs read as a canopy and cost almost nothing.
  const canopyBase = trunkHeight * 0.92
  const blobs = [
    [0, canopyBase + height * 0.26, 0, height * 0.28],
    [height * 0.13, canopyBase + height * 0.16, height * 0.06, height * 0.2],
    [-height * 0.11, canopyBase + height * 0.2, -height * 0.08, height * 0.18],
  ]
  blobs.forEach(([x, y, z, radius], index) => {
    const blob = ball(radius, leaves, { detail: 0 })
    blob.position.set(x, y, z)
    blob.rotation.y = (index + seedOffset) * 1.7
    group.add(blob)
  })

  group.userData.height = height
  return group
}

/** Conifer — stacked cones, good for snowy and forest levels. */
export function pineTree(options = {}) {
  const { trunk = PALETTE.rust, leaves = "#166534", height = 5, tiers = 3 } = options
  const group = new THREE.Group()

  const trunkHeight = height * 0.25
  const stem = cylinder(height * 0.05, height * 0.07, trunkHeight, trunk, { segments: 6 })
  stem.position.y = trunkHeight / 2
  group.add(stem)

  for (let i = 0; i < tiers; i++) {
    const t = i / tiers
    const radius = height * 0.3 * (1 - t * 0.55)
    const tierHeight = height * 0.42 * (1 - t * 0.2)
    const tier = cone(radius, tierHeight, leaves, { segments: 7 })
    tier.position.y = trunkHeight + height * 0.18 + i * height * 0.22 + tierHeight / 2
    group.add(tier)
  }
  return group
}

export function bush(options = {}) {
  const { color = PALETTE.moss, size = 1 } = options
  const group = new THREE.Group()
  for (let i = 0; i < 3; i++) {
    const blob = ball(size * (0.34 - i * 0.05), color, { detail: 0 })
    blob.position.set(
      Math.cos(i * 2.1) * size * 0.22,
      size * 0.26 + i * size * 0.06,
      Math.sin(i * 2.1) * size * 0.22
    )
    group.add(blob)
  }
  return group
}

/** Irregular rock — pass different `seed` values so a field of them varies. */
export function rock(options = {}) {
  const { color = PALETTE.smoke, size = 1, seed = 1 } = options
  const mesh = ball(size * 0.5, color, { detail: 0 })
  mesh.rotation.set(seed * 0.7, seed * 1.3, seed * 0.4)
  mesh.scale.set(1, 0.72 + ((seed * 7) % 5) * 0.06, 0.9)
  mesh.position.y = size * 0.3
  const group = new THREE.Group()
  group.add(mesh)
  return group
}

/** Wooden crate with plank trim — the universal pushable/breakable prop. */
export function crate(options = {}) {
  const { color = "#a16207", trim = PALETTE.rust, size = 1 } = options
  const group = new THREE.Group()
  const body = box(size, size, size, color)
  body.position.y = size / 2
  group.add(body)

  const bar = size * 0.1
  for (const axis of ["x", "y"]) {
    const plank = box(
      axis === "x" ? size * 1.02 : bar,
      axis === "x" ? bar : size * 1.02,
      size * 1.02,
      trim
    )
    plank.position.y = size / 2
    group.add(plank)
  }
  group.userData.size = size
  return group
}

export function barrel(options = {}) {
  const { color = PALETTE.clay, trim = PALETTE.slate, height = 1.1, radius = 0.42 } = options
  const group = new THREE.Group()
  const body = cylinder(radius, radius * 0.92, height, color, { segments: 10 })
  body.position.y = height / 2
  group.add(body)
  for (const y of [height * 0.28, height * 0.72]) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.02, radius * 0.06, 5, 12),
      solid(trim)
    )
    band.rotation.x = Math.PI / 2
    band.position.y = y
    group.add(band)
  }
  return group
}

// --- pickups ----------------------------------------------------------------

/** Spinning coin. Rotate it on Y; `animation.bob` makes it float. */
export function coin(options = {}) {
  const { color = PALETTE.sand, radius = 0.32 } = options
  const mesh = cylinder(radius, radius, radius * 0.16, color, { segments: 14, material: glow(color, 0.6) })
  mesh.rotation.x = Math.PI / 2
  const group = new THREE.Group()
  group.add(mesh)
  group.position.y = radius
  group.userData.radius = radius
  return group
}

export function gem(options = {}) {
  const { color = PALETTE.sky, size = 0.4 } = options
  const mesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(size, 0),
    solid(color, { emissive: color, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.2 })
  )
  mesh.castShadow = true
  const group = new THREE.Group()
  group.add(mesh)
  return group
}

export function heart(options = {}) {
  const { color = PALETTE.berry, size = 0.34 } = options
  const group = new THREE.Group()
  const material = glow(color, 0.5)
  for (const x of [-size * 0.33, size * 0.33]) {
    const lobe = ball(size * 0.44, color, { detail: 1, flat: false, material })
    lobe.position.set(x, size * 0.28, 0)
    group.add(lobe)
  }
  const tip = cone(size * 0.62, size * 0.9, color, { segments: 4, material })
  tip.rotation.z = Math.PI
  tip.position.y = -size * 0.18
  group.add(tip)
  return group
}

export function star(options = {}) {
  const { color = PALETTE.sand, size = 0.4, points = 5 } = options
  const shape = new THREE.Shape()
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? size : size * 0.45
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  const mesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: size * 0.2, bevelEnabled: false }),
    glow(color, 0.8)
  )
  mesh.castShadow = true
  mesh.position.z = -size * 0.1
  const group = new THREE.Group()
  group.add(mesh)
  return group
}

export function key(options = {}) {
  const { color = PALETTE.sand, size = 0.5 } = options
  const group = new THREE.Group()
  const material = solid(color, { metalness: 0.7, roughness: 0.3 })
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(size * 0.22, size * 0.06, 6, 14),
    material
  )
  const shaft = box(size * 0.08, size * 0.7, size * 0.08, color, { material })
  shaft.position.y = -size * 0.5
  const tooth = box(size * 0.22, size * 0.08, size * 0.08, color, { material })
  tooth.position.set(size * 0.1, -size * 0.74, 0)
  group.add(ring, shaft, tooth)
  return group
}

/** Openable chest — `group.userData.lid` is the pivot to rotate on X. */
export function chest(options = {}) {
  const { wood = "#8b5a2b", metal = PALETTE.sand, size = 1 } = options
  const group = new THREE.Group()
  const base = box(size, size * 0.55, size * 0.7, wood)
  base.position.y = size * 0.275
  group.add(base)

  const lidPivot = new THREE.Group()
  lidPivot.position.set(0, size * 0.55, -size * 0.35)
  const lid = box(size, size * 0.3, size * 0.7, wood)
  lid.position.set(0, size * 0.15, size * 0.35)
  lidPivot.add(lid)
  group.add(lidPivot)

  const lock = box(size * 0.16, size * 0.2, size * 0.1, metal)
  lock.position.set(0, size * 0.42, size * 0.37)
  group.add(lock)

  group.userData.lid = lidPivot
  return group
}

// --- structures -------------------------------------------------------------

/** Flat platform. Add it to the physics world with `world.addObject(...)`. */
export function platform(options = {}) {
  const {
    width = 4,
    depth = 4,
    thickness = 0.5,
    color = PALETTE.slate,
    top = PALETTE.brand,
  } = options
  const group = new THREE.Group()
  const body = box(width, thickness, depth, color)
  group.add(body)
  if (top) {
    const surface = box(width * 0.98, thickness * 0.2, depth * 0.98, top)
    surface.position.y = thickness * 0.5
    group.add(surface)
  }
  group.userData.size = { x: width, y: thickness, z: depth }
  return group
}

/** Staircase of `steps` boxes rising along +Z. */
export function stairs(options = {}) {
  const { steps = 6, width = 3, rise = 0.35, run = 0.5, color = PALETTE.slate } = options
  const group = new THREE.Group()
  for (let i = 0; i < steps; i++) {
    const step = box(width, rise * (i + 1), run, color)
    step.position.set(0, (rise * (i + 1)) / 2, i * run)
    group.add(step)
  }
  group.userData.height = rise * steps
  return group
}

/** Simple house with a pitched roof and a door. */
export function house(options = {}) {
  const {
    walls = PALETTE.cream,
    roof = PALETTE.berry,
    door = PALETTE.rust,
    width = 4,
    depth = 4,
    height = 3,
  } = options
  const group = new THREE.Group()

  const body = box(width, height, depth, walls)
  body.position.y = height / 2
  group.add(body)

  const roofMesh = cone(Math.max(width, depth) * 0.78, height * 0.6, roof, { segments: 4 })
  roofMesh.position.y = height + height * 0.3
  roofMesh.rotation.y = Math.PI / 4
  group.add(roofMesh)

  const doorMesh = box(width * 0.22, height * 0.5, 0.1, door)
  doorMesh.position.set(0, height * 0.25, depth / 2 + 0.05)
  group.add(doorMesh)

  for (const side of [-1, 1]) {
    const window = box(width * 0.18, height * 0.2, 0.1, PALETTE.sky)
    window.position.set(side * width * 0.28, height * 0.6, depth / 2 + 0.05)
    group.add(window)
  }
  return group
}

/** A wall segment, sized so you can lay out a level in a loop. */
export function wall(options = {}) {
  const { width = 4, height = 3, thickness = 0.4, color = PALETTE.slate } = options
  const group = new THREE.Group()
  const mesh = box(width, height, thickness, color)
  mesh.position.y = height / 2
  group.add(mesh)
  return group
}

/** Glowing goal ring — a level exit, teleporter or checkpoint. */
export function portal(options = {}) {
  const { color = PALETTE.plum, radius = 1.2 } = options
  const group = new THREE.Group()
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, radius * 0.14, 8, 24),
    glow(color, 1.6)
  )
  ring.position.y = radius
  group.add(ring)

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.92, 24),
    unlit(color, { transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  )
  disc.position.y = radius
  group.add(disc)

  group.userData.ring = ring
  group.userData.disc = disc
  return group
}

export function flag(options = {}) {
  const { pole = PALETTE.mist, cloth = PALETTE.brand, height = 3 } = options
  const group = new THREE.Group()
  const mast = cylinder(0.05, 0.05, height, pole, { segments: 6 })
  mast.position.y = height / 2
  group.add(mast)
  const banner = box(0.9, 0.6, 0.04, cloth)
  banner.position.set(0.45, height - 0.45, 0)
  group.add(banner)
  group.userData.banner = banner
  return group
}

/** Torch with a real point light — place a few to light a dungeon. */
export function torch(options = {}) {
  const { color = "#ffb347", intensity = 2.2, distance = 12, height = 1.2 } = options
  const group = new THREE.Group()
  const stick = cylinder(0.05, 0.07, height, PALETTE.rust, { segments: 6 })
  stick.position.y = height / 2
  group.add(stick)

  const flame = ball(0.16, color, { detail: 0, material: glow(color, 2) })
  flame.position.y = height + 0.1
  flame.scale.y = 1.5
  group.add(flame)

  const light = new THREE.PointLight(color, intensity, distance, 2)
  light.position.y = height + 0.15
  group.add(light)

  group.userData.flame = flame
  group.userData.light = light
  return group
}

export function cloud(options = {}) {
  const { color = PALETTE.white, size = 3, puffs = 4 } = options
  const group = new THREE.Group()
  for (let i = 0; i < puffs; i++) {
    const puff = ball(size * (0.3 - (i % 2) * 0.07), color, {
      detail: 0,
      material: solid(color, { roughness: 1, flatShading: true }),
    })
    puff.position.set((i - puffs / 2) * size * 0.28, (i % 2) * size * 0.08, (i % 3) * size * 0.1)
    group.add(puff)
    puff.castShadow = false
  }
  return group
}

// --- vehicles and projectiles ----------------------------------------------

/** Chunky arcade car, facing +Z to match VehicleController. */
export function car(options = {}) {
  const { body: bodyColor = PALETTE.berry, cabin = PALETTE.sky, wheels = PALETTE.ink } = options
  const group = new THREE.Group()

  const chassis = box(1.7, 0.55, 3.4, bodyColor)
  chassis.position.y = 0.62
  group.add(chassis)

  const roof = box(1.4, 0.5, 1.6, cabin)
  roof.position.set(0, 1.12, -0.2)
  group.add(roof)

  const wheelGeometry = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12)
  const wheelMaterial = solid(wheels, { roughness: 0.9 })
  const wheelMeshes = []
  for (const x of [-0.82, 0.82]) {
    for (const z of [-1.1, 1.1]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial)
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(x, 0.36, z)
      wheel.castShadow = true
      group.add(wheel)
      wheelMeshes.push(wheel)
    }
  }
  group.userData.wheels = wheelMeshes
  return group
}

/** Small ship, facing +Z. */
export function spaceship(options = {}) {
  const { hull = PALETTE.mist, accent = PALETTE.brand, glass: canopy = PALETTE.sky } = options
  const group = new THREE.Group()

  const body = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 6), solid(hull))
  body.rotation.x = Math.PI / 2
  body.castShadow = true
  group.add(body)

  for (const side of [-1, 1]) {
    const wing = box(1.1, 0.1, 0.7, accent)
    wing.position.set(side * 0.7, 0, -0.4)
    wing.rotation.z = side * 0.18
    group.add(wing)
  }

  const dome = ball(0.28, canopy, { detail: 1, flat: false, material: glow(canopy, 0.4) })
  dome.position.set(0, 0.2, 0.25)
  group.add(dome)

  const thruster = ball(0.22, accent, { detail: 0, material: glow(accent, 2) })
  thruster.position.z = -1.15
  group.add(thruster)

  group.userData.thruster = thruster
  return group
}

/** Glowing projectile. Cheap enough to spawn hundreds of. */
export function projectile(options = {}) {
  const { color = PALETTE.brandLight, radius = 0.15, trail = true } = options
  const group = new THREE.Group()
  const core = ball(radius, color, { detail: 1, flat: false, material: glow(color, 2.4) })
  core.castShadow = false
  group.add(core)
  if (trail) {
    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.8, radius * 5, 6),
      unlit(color, { transparent: true, opacity: 0.35 })
    )
    tail.rotation.x = Math.PI / 2
    tail.position.z = -radius * 2.6
    group.add(tail)
  }
  return group
}

export function turret(options = {}) {
  const { base = PALETTE.slate, barrel: barrelColor = PALETTE.charcoal, accent = PALETTE.berry } = options
  const group = new THREE.Group()
  const foot = cylinder(0.55, 0.65, 0.4, base, { segments: 8 })
  foot.position.y = 0.2
  group.add(foot)

  const head = new THREE.Group()
  head.position.y = 0.55
  const dome = ball(0.42, base, { detail: 1 })
  head.add(dome)
  const gun = cylinder(0.1, 0.1, 1.1, barrelColor, { segments: 8 })
  gun.rotation.x = Math.PI / 2
  gun.position.z = 0.55
  head.add(gun)
  const eye = ball(0.1, accent, { detail: 0, material: glow(accent, 2) })
  eye.position.set(0, 0.16, 0.34)
  head.add(eye)
  group.add(head)

  group.userData.head = head
  return group
}

// --- ground -----------------------------------------------------------------

/** A large ground plane. Receives shadows, never casts them. */
export function ground(options = {}) {
  const { size = 100, color = PALETTE.charcoal, material = null, segments = 1 } = options
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size, segments, segments),
    material || solid(color, { roughness: 1, flatShading: false })
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.receiveShadow = true
  mesh.castShadow = false
  mesh.name = "ground"
  return mesh
}

/** Translucent water surface. Animate `mesh.material.opacity` or its position. */
export function water(options = {}) {
  const { size = 100, color = "#1d4ed8", opacity = 0.7, y = 0 } = options
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size, 1, 1),
    new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity,
      roughness: 0.15,
      metalness: 0.1,
    })
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = y
  mesh.receiveShadow = true
  return mesh
}

/**
 * Applies shadow settings to a whole subtree. Call it after assembling a group
 * from parts that came from elsewhere.
 */
export function setShadows(object, { cast = true, receive = true } = {}) {
  object.traverse((child) => {
    if (!child.isMesh) return
    child.castShadow = cast
    child.receiveShadow = receive
  })
  return object
}

/** Recolours every mesh in a subtree — reskinning enemies by tier, for example. */
export function recolor(object, color) {
  object.traverse((child) => {
    if (child.isMesh && child.material?.color) {
      child.material = child.material.clone()
      child.material.color.set(color)
    }
  })
  return object
}
