/*
  World building: skies, terrain, tile maps, mazes, arenas and instanced
  scatter.

  These produce the stage a game is played on. Everything returns plain meshes
  and groups, so you can hand any of them to `physicsWorld.addObject()` to make
  it solid.
*/

import * as THREE from "./three.js"

import { fbm2D, RNG, ridgeNoise2D } from "./random.js"
import { gradientTexture, PALETTE, sampleRamp, solid, unlit } from "./materials.js"

/**
 * A gradient sky dome. Cheaper and more controllable than an HDR environment,
 * and it needs no download.
 */
export function skyDome({ top = "#2f6fd0", bottom = "#ffd9a8", radius = 500 } = {}) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 16),
    unlit(0xffffff, { side: THREE.BackSide })
  )
  mesh.material = mesh.material.clone()
  mesh.material.map = gradientTexture([top, bottom], 256)
  mesh.material.needsUpdate = true
  mesh.name = "sky"
  mesh.frustumCulled = false
  return mesh
}

/** Points scattered on a sphere around the origin — a night or space backdrop. */
export function starfield({ count = 900, radius = 400, size = 1.6, seed = 7 } = {}) {
  const rng = new RNG(seed)
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const color = new THREE.Color()

  for (let i = 0; i < count; i++) {
    // Even coverage of a sphere: uniform in cos(phi), not in phi.
    const theta = rng.angle()
    const cosPhi = rng.float(-1, 1)
    const sinPhi = Math.sqrt(1 - cosPhi * cosPhi)
    positions[i * 3] = Math.cos(theta) * sinPhi * radius
    positions[i * 3 + 1] = cosPhi * radius
    positions[i * 3 + 2] = Math.sin(theta) * sinPhi * radius

    color.setHSL(rng.float(0.55, 0.68), rng.float(0, 0.35), rng.float(0.6, 1))
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: false })
  )
  points.name = "stars"
  points.frustumCulled = false
  return points
}

/**
 * Noise-based terrain with height-banded vertex colours.
 *
 * @param {object} [options] size, segments, amplitude, frequency, octaves,
 *   seed, ramp (a palette ramp name or array), ridged (sharp mountains), flat
 * @returns {THREE.Mesh} with `mesh.heightAt(x, z)` for placing objects and
 *   `mesh.terrain` holding the generation parameters
 */
export function terrain(options = {}) {
  const {
    size = 120,
    segments = 96,
    amplitude = 10,
    frequency = 0.9,
    octaves = 5,
    seed = 1,
    ramp = "terrain",
    ridged = false,
    flatRadius = 0, // keep a level clearing at the centre for a spawn point
    flatShading = true,
  } = options

  // One height function, used both to build the mesh and to answer queries, so
  // objects placed with heightAt() always sit exactly on the surface.
  const scale = frequency / size
  const noiseAt = (x, z) => {
    const value = ridged
      ? ridgeNoise2D(x * scale, z * scale, { octaves, seed })
      : fbm2D(x * scale, z * scale, { octaves, seed })
    let height = (value - 0.35) * amplitude
    if (flatRadius > 0) {
      const distance = Math.hypot(x, z)
      if (distance < flatRadius) {
        height *= Math.min(1, (distance / flatRadius) ** 2)
      }
    }
    return height
  }

  const geometry = new THREE.PlaneGeometry(size, size, segments, segments)
  geometry.rotateX(-Math.PI / 2) // now local X/Z match world X/Z

  const position = geometry.attributes.position
  const colors = new Float32Array(position.count * 3)
  let min = Infinity
  let max = -Infinity

  for (let i = 0; i < position.count; i++) {
    const height = noiseAt(position.getX(i), position.getZ(i))
    position.setY(i, height)
    if (height < min) min = height
    if (height > max) max = height
  }

  const range = Math.max(0.0001, max - min)
  for (let i = 0; i < position.count; i++) {
    const t = (position.getY(i) - min) / range
    const color = sampleRamp(ramp, t)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()

  const mesh = new THREE.Mesh(
    geometry,
    solid(0xffffff, { vertexColors: true, flatShading, roughness: 1 })
  )
  mesh.receiveShadow = true
  mesh.castShadow = false
  mesh.name = "terrain"
  mesh.heightAt = noiseAt
  mesh.terrain = { size, segments, amplitude, seed, min, max }
  return mesh
}

/**
 * Builds a level from a 2D map. `get(col, row)` returns null for empty, or
 * `{ height, color, solid }` for a block — the quickest way to turn a level
 * described as text into geometry.
 *
 *   const level = tileMap({
 *     cols: 20, rows: 20, cellSize: 2,
 *     get: (x, y) => (MAP[y][x] === "#" ? { height: 3 } : null),
 *   })
 */
export function tileMap(options = {}) {
  const {
    cols = 16,
    rows = 16,
    cellSize = 2,
    get = () => null,
    color = PALETTE.slate,
    center = true,
  } = options

  const group = new THREE.Group()
  group.name = "tilemap"
  const offsetX = center ? ((cols - 1) * cellSize) / 2 : 0
  const offsetZ = center ? ((rows - 1) * cellSize) / 2 : 0

  // Group tiles by colour+height so each distinct kind becomes one InstancedMesh.
  const buckets = new Map()
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tile = get(col, row)
      if (!tile) continue
      const height = tile.height ?? cellSize
      const tileColor = tile.color ?? color
      const key = `${height}|${tileColor}`
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = { height, color: tileColor, cells: [] }
        buckets.set(key, bucket)
      }
      bucket.cells.push({
        x: col * cellSize - offsetX,
        z: row * cellSize - offsetZ,
        y: (tile.y ?? 0) + height / 2,
        col,
        row,
      })
    }
  }

  const matrix = new THREE.Matrix4()
  for (const bucket of buckets.values()) {
    const geometry = new THREE.BoxGeometry(cellSize, bucket.height, cellSize)
    const mesh = new THREE.InstancedMesh(
      geometry,
      solid(bucket.color),
      bucket.cells.length
    )
    mesh.castShadow = true
    mesh.receiveShadow = true
    bucket.cells.forEach((cell, index) => {
      matrix.makeTranslation(cell.x, cell.y, cell.z)
      mesh.setMatrixAt(index, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }

  group.userData.cells = [...buckets.values()].flatMap((bucket) =>
    bucket.cells.map((cell) => ({ ...cell, height: bucket.height }))
  )
  group.userData.cellSize = cellSize
  group.userData.toWorld = (col, row) => ({
    x: col * cellSize - offsetX,
    z: row * cellSize - offsetZ,
  })
  return group
}

/**
 * Adds every tile of a `tileMap` to a physics world as a solid box. Instanced
 * meshes have no per-instance bounding box, so this reads the cell list the
 * builder recorded instead.
 */
export function tileMapColliders(group, physicsWorld, options = {}) {
  const cellSize = group.userData.cellSize
  const colliders = []
  for (const cell of group.userData.cells || []) {
    colliders.push(
      physicsWorld.addBox(
        { x: cell.x + group.position.x, y: cell.y + group.position.y, z: cell.z + group.position.z },
        { x: cellSize, y: cell.height, z: cellSize },
        options
      )
    )
  }
  return colliders
}

/**
 * Recursive-backtracker maze. Returns a grid where true means wall.
 * Dimensions are forced odd so corridors and walls alternate cleanly.
 */
export function generateMaze(cols = 21, rows = 21, seed = 1) {
  const width = cols % 2 === 0 ? cols + 1 : cols
  const height = rows % 2 === 0 ? rows + 1 : rows
  const rng = new RNG(seed)

  const grid = Array.from({ length: height }, () => new Array(width).fill(true))
  const stack = [[1, 1]]
  grid[1][1] = false

  while (stack.length > 0) {
    const [x, y] = stack[stack.length - 1]
    const neighbours = []
    for (const [dx, dy] of [[0, -2], [2, 0], [0, 2], [-2, 0]]) {
      const nx = x + dx
      const ny = y + dy
      if (nx > 0 && ny > 0 && nx < width - 1 && ny < height - 1 && grid[ny][nx]) {
        neighbours.push([nx, ny, x + dx / 2, y + dy / 2])
      }
    }
    if (neighbours.length === 0) {
      stack.pop()
      continue
    }
    const [nx, ny, wx, wy] = rng.pick(neighbours)
    grid[wy][wx] = false
    grid[ny][nx] = false
    stack.push([nx, ny])
  }

  return { grid, width, height }
}

/** Turns a maze grid (or any boolean grid) into geometry via `tileMap`. */
export function mazeMesh(maze, options = {}) {
  const { cellSize = 2, height = 3, color = PALETTE.slate } = options
  return tileMap({
    cols: maze.width,
    rows: maze.height,
    cellSize,
    get: (col, row) => (maze.grid[row][col] ? { height, color } : null),
    ...options,
  })
}

/**
 * A flat playing field ringed by walls. The single most reused level shape:
 * arena shooters, survival waves, party games, test scenes.
 */
export function arena(options = {}) {
  const {
    size = 40,
    wallHeight = 3,
    wallThickness = 1,
    floorColor = PALETTE.charcoal,
    wallColor = PALETTE.slate,
    trimColor = PALETTE.brand,
  } = options

  const group = new THREE.Group()
  group.name = "arena"

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(size, 1, size),
    solid(floorColor, { roughness: 1 })
  )
  floor.position.y = -0.5
  floor.receiveShadow = true
  group.add(floor)

  const half = size / 2 + wallThickness / 2
  const specs = [
    { x: 0, z: -half, w: size + wallThickness * 2, d: wallThickness },
    { x: 0, z: half, w: size + wallThickness * 2, d: wallThickness },
    { x: -half, z: 0, w: wallThickness, d: size },
    { x: half, z: 0, w: wallThickness, d: size },
  ]
  const walls = []
  for (const spec of specs) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(spec.w, wallHeight, spec.d),
      solid(wallColor)
    )
    wall.position.set(spec.x, wallHeight / 2, spec.z)
    wall.castShadow = true
    wall.receiveShadow = true
    group.add(wall)
    walls.push(wall)

    if (trimColor) {
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(spec.w * 1.001, wallHeight * 0.08, spec.d * 1.001),
        solid(trimColor, { emissive: trimColor, emissiveIntensity: 0.4 })
      )
      trim.position.set(spec.x, wallHeight, spec.z)
      group.add(trim)
    }
  }

  group.userData.floor = floor
  group.userData.walls = walls
  group.userData.size = size
  return group
}

/**
 * Many copies of one mesh in a single draw call. Use for grass, trees, rocks,
 * crates, bullets — anything that appears dozens of times.
 *
 *   const trees = new InstancedField(scene, trunkGeometry, trunkMaterial, 400)
 *   trees.add({ x, y, z }, { rotationY: rng.angle(), scale: rng.float(0.8, 1.3) })
 *   trees.commit()
 */
export class InstancedField {
  constructor(scene, geometry, material, max = 256) {
    this.mesh = new THREE.InstancedMesh(geometry, material, max)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.count = 0
    this.max = max
    this.scene = scene
    scene.add(this.mesh)

    this._matrix = new THREE.Matrix4()
    this._quaternion = new THREE.Quaternion()
    this._position = new THREE.Vector3()
    this._scale = new THREE.Vector3()
    this._euler = new THREE.Euler()
  }

  get count() {
    return this.mesh.count
  }

  add(position, { rotationY = 0, rotationX = 0, rotationZ = 0, scale = 1 } = {}) {
    if (this.mesh.count >= this.max) return -1
    const index = this.mesh.count++
    this.setAt(index, position, { rotationY, rotationX, rotationZ, scale })
    return index
  }

  setAt(index, position, { rotationY = 0, rotationX = 0, rotationZ = 0, scale = 1 } = {}) {
    this._position.set(position.x, position.y, position.z)
    this._euler.set(rotationX, rotationY, rotationZ)
    this._quaternion.setFromEuler(this._euler)
    if (typeof scale === "number") this._scale.setScalar(scale)
    else this._scale.set(scale.x, scale.y, scale.z)
    this._matrix.compose(this._position, this._quaternion, this._scale)
    this.mesh.setMatrixAt(index, this._matrix)
    return this
  }

  setColorAt(index, color) {
    this.mesh.setColorAt(index, new THREE.Color(color))
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    return this
  }

  /** Call once after adding or moving instances. */
  commit() {
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.computeBoundingSphere()
    return this
  }

  clear() {
    this.mesh.count = 0
    return this
  }

  dispose() {
    this.scene.remove(this.mesh)
    this.mesh.dispose()
  }
}

/**
 * Scatters objects over an area without overlapping, using dart throwing.
 * `place(position, index)` is called with each accepted point.
 *
 *   scatter({ count: 60, size: 90, minDistance: 4, rng, place: (p) => {
 *     const t = tree(); t.position.copy(p); scene.add(t)
 *   }})
 */
export function scatter(options = {}) {
  const {
    count = 40,
    size = 80,
    minDistance = 3,
    rng = new RNG(1),
    heightAt = null,
    exclude = null, // (position) => true to reject, e.g. the spawn clearing
    place = null,
    maxAttempts = 30,
  } = options

  const placed = []
  const minSquared = minDistance * minDistance

  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = rng.float(-size / 2, size / 2)
      const z = rng.float(-size / 2, size / 2)

      let tooClose = false
      for (const other of placed) {
        const dx = other.x - x
        const dz = other.z - z
        if (dx * dx + dz * dz < minSquared) {
          tooClose = true
          break
        }
      }
      if (tooClose) continue

      const position = new THREE.Vector3(x, heightAt ? heightAt(x, z) : 0, z)
      if (exclude && exclude(position)) continue

      placed.push(position)
      place?.(position, placed.length - 1)
      break
    }
  }
  return placed
}

/** Evenly spaced points on a circle — spawn rings, enemy formations, menus. */
export function ringPoints(count, radius, y = 0) {
  const points = []
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    points.push(
      new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
    )
  }
  return points
}

/** Faint reference grid. Helpful while building, usually removed before release. */
export function groundGrid({ size = 100, divisions = 50, color = PALETTE.slate, centerColor = PALETTE.brand } = {}) {
  const grid = new THREE.GridHelper(size, divisions, centerColor, color)
  grid.material.opacity = 0.35
  grid.material.transparent = true
  return grid
}
