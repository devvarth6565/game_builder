/*
  Deterministic randomness and value noise.

  Games that generate their world (terrain, loot, level layout) should draw from
  an RNG with a known seed instead of Math.random, so the same seed always
  rebuilds the same world and bugs are reproducible.
*/

// Turns any string or number into a non-zero 32-bit seed.
export function hashSeed(input) {
  if (typeof input === "number" && Number.isFinite(input)) {
    return (input >>> 0) || 1
  }
  const str = String(input)
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return (h >>> 0) || 1
}

// A small, fast, seedable generator (mulberry32). Not cryptographic — it is for
// worlds and loot tables, never for anything that needs to be unguessable.
export class RNG {
  constructor(seed = Date.now()) {
    this.setSeed(seed)
  }

  setSeed(seed) {
    this.initialSeed = seed
    this.state = hashSeed(seed)
    return this
  }

  reset() {
    return this.setSeed(this.initialSeed)
  }

  // A fresh generator derived from this one — handy for giving each subsystem
  // (terrain, enemies, loot) its own stream so adding a roll in one place does
  // not shift every other result.
  fork(label = "fork") {
    return new RNG(hashSeed(`${label}:${this.state}`))
  }

  // Float in [0, 1).
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  float(min = 0, max = 1) {
    return min + this.next() * (max - min)
  }

  // Integer in [min, max], both inclusive.
  int(min, max) {
    return Math.floor(min + this.next() * (max - min + 1))
  }

  bool(probability = 0.5) {
    return this.next() < probability
  }

  sign() {
    return this.next() < 0.5 ? -1 : 1
  }

  angle() {
    return this.next() * Math.PI * 2
  }

  pick(items) {
    return items[Math.floor(this.next() * items.length)]
  }

  // weighted([["common", 10], ["rare", 1]]) — returns one item, odds by weight.
  weighted(entries) {
    let total = 0
    for (const [, weight] of entries) total += weight
    let roll = this.next() * total
    for (const [item, weight] of entries) {
      roll -= weight
      if (roll <= 0) return item
    }
    return entries[entries.length - 1][0]
  }

  // Fisher-Yates, in place.
  shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      const tmp = items[i]
      items[i] = items[j]
      items[j] = tmp
    }
    return items
  }

  // `count` distinct items, without repeats.
  sample(items, count) {
    return this.shuffle(items.slice()).slice(0, count)
  }

  gaussian(mean = 0, deviation = 1) {
    let u = 0
    let v = 0
    while (u === 0) u = this.next()
    while (v === 0) v = this.next()
    return (
      mean + deviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    )
  }

  // Point on the XZ plane, on (or inside) a circle of `radius`.
  onCircle(radius = 1) {
    const a = this.angle()
    return { x: Math.cos(a) * radius, z: Math.sin(a) * radius }
  }

  inCircle(radius = 1) {
    // sqrt keeps the points evenly spread instead of clumping at the centre.
    return this.onCircle(radius * Math.sqrt(this.next()))
  }

  // Point inside an axis-aligned box centred on the origin.
  inBox(width = 1, height = 0, depth = width) {
    return {
      x: this.float(-width / 2, width / 2),
      y: this.float(-height / 2, height / 2),
      z: this.float(-depth / 2, depth / 2),
    }
  }

  // An "#rrggbb" string, useful for quick variation on procedural props.
  hexColor({ hue = null, saturation = 0.6, lightness = 0.55 } = {}) {
    const h = hue === null ? this.next() : hue
    const toByte = (n) => {
      const k = (n + h * 12) % 12
      const a = saturation * Math.min(lightness, 1 - lightness)
      const value = lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
      return Math.round(value * 255)
        .toString(16)
        .padStart(2, "0")
    }
    return `#${toByte(0)}${toByte(8)}${toByte(4)}`
  }
}

// A shared generator for throwaway rolls where reproducibility does not matter.
export const rng = new RNG()

function hash2(x, y, seed) {
  let h = (seed + Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Smooth value noise in [0, 1]. Whole-number coordinates are lattice points, so
// scale your input down (x * 0.05) to get broad features.
export function valueNoise2D(x, y, seed = 0) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const n00 = hash2(x0, y0, seed)
  const n10 = hash2(x0 + 1, y0, seed)
  const n01 = hash2(x0, y0 + 1, seed)
  const n11 = hash2(x0 + 1, y0 + 1, seed)
  const top = n00 + (n10 - n00) * sx
  const bottom = n01 + (n11 - n01) * sx
  return top + (bottom - top) * sy
}

// Layered noise in [0, 1] — the usual way to build natural-looking terrain.
// Bigger `octaves` adds finer detail at a linear cost.
export function fbm2D(x, y, options = {}) {
  const {
    octaves = 4,
    frequency = 1,
    lacunarity = 2,
    gain = 0.5,
    seed = 0,
  } = options
  let sum = 0
  let norm = 0
  let amp = 1
  let freq = frequency
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(x * freq, y * freq, seed + i * 1013) * amp
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return norm > 0 ? sum / norm : 0
}

// Ridged noise in [0, 1] — sharp crests, good for mountains and canyons.
export function ridgeNoise2D(x, y, options = {}) {
  return 1 - Math.abs(fbm2D(x, y, options) * 2 - 1)
}
