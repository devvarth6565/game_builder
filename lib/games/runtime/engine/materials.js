/*
  Palette, material factories and procedurally generated textures.

  Two rules keep a generated game looking deliberate rather than assembled:
  pick colours from one palette, and give every surface the same shading
  treatment. The helpers below default to flat-shaded, low-poly-looking
  MeshStandardMaterial, which reads well under the lighting presets and costs
  nothing to load.
*/

import * as THREE from "./three.js"

// The house palette, taken from the product logo (a warm orange mark on near
// black). Games are free to use their own colours, but these always look right
// together and are a good default when the pitch does not specify a look.
export const PALETTE = {
  brand: "#ea580c", // logo orange
  brandLight: "#fb923c",
  brandPale: "#fed7aa",
  cream: "#fff7ed",
  ember: "#c2410c",
  rust: "#7c2d12",

  ink: "#0b0b0f", // page background
  charcoal: "#17171d",
  slate: "#2a2a35",
  smoke: "#6b6b78",
  mist: "#c7c7d1",
  white: "#f5f5fa",

  sky: "#7dd3fc",
  deep: "#0369a1",
  leaf: "#4ade80",
  moss: "#15803d",
  sand: "#fcd34d",
  clay: "#b45309",
  berry: "#e11d48",
  plum: "#7c3aed",
}

// Colour ramps for terrain bands, team colours, charts and difficulty tiers.
export const RAMPS = {
  ember: ["#7c2d12", "#c2410c", "#ea580c", "#fb923c", "#fed7aa"],
  // Water, sand, grass, forest, rock, snow — muted on purpose, since a terrain
  // fills the frame and saturated bands read as radioactive at that scale.
  terrain: ["#3b6ea5", "#d8c79b", "#7aa757", "#4a7c45", "#8a8b91", "#eef1f5"],
  heat: ["#0369a1", "#4ade80", "#fcd34d", "#ea580c", "#e11d48"],
  mono: ["#0b0b0f", "#2a2a35", "#6b6b78", "#c7c7d1", "#f5f5fa"],
}

// Samples a ramp at t in [0, 1] and returns a THREE.Color.
export function sampleRamp(ramp, t) {
  const stops = Array.isArray(ramp) ? ramp : RAMPS[ramp] || RAMPS.ember
  const clamped = Math.max(0, Math.min(1, t))
  const scaled = clamped * (stops.length - 1)
  const index = Math.min(stops.length - 2, Math.floor(scaled))
  const local = scaled - index
  return new THREE.Color(stops[index]).lerp(
    new THREE.Color(stops[index + 1]),
    local
  )
}

// Every material made here is registered so dispose() can free them in one go.
const tracked = new Set()
const cache = new Map()

function track(material) {
  tracked.add(material)
  return material
}

// Materials are the most duplicated object in a generated scene. `cached` keys
// them so a thousand crates share one material and therefore one draw state.
function cached(key, build) {
  let material = cache.get(key)
  if (!material) {
    material = track(build())
    cache.set(key, material)
  }
  return material
}

/**
 * The default surface: flat-shaded, matte, lit. Use for almost everything.
 * @param {number|string} color
 * @param {object} [options] roughness, metalness, flatShading, emissive,
 *   emissiveIntensity, transparent, opacity, side, vertexColors
 */
export function solid(color = PALETTE.brand, options = {}) {
  const {
    roughness = 0.8,
    metalness = 0,
    flatShading = true,
    emissive = 0x000000,
    emissiveIntensity = 1,
    transparent = false,
    opacity = 1,
    side = THREE.FrontSide,
    vertexColors = false,
  } = options

  const key = `solid:${color}:${roughness}:${metalness}:${flatShading}:${emissive}:${emissiveIntensity}:${transparent}:${opacity}:${side}:${vertexColors}`
  return cached(
    key,
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
        flatShading,
        emissive,
        emissiveIntensity,
        transparent,
        opacity,
        side,
        vertexColors,
      })
  )
}

/** Smooth-shaded variant, for spheres, balls and organic shapes. */
export function smooth(color = PALETTE.brand, options = {}) {
  return solid(color, { ...options, flatShading: false })
}

/** Banded cel shading — a cartoon look that needs no textures. */
export function toon(color = PALETTE.brand, steps = 4) {
  const key = `toon:${color}:${steps}`
  return cached(key, () => {
    const data = new Uint8Array(steps)
    for (let i = 0; i < steps; i++) {
      data[i] = Math.round((i / (steps - 1)) * 255)
    }
    const gradient = new THREE.DataTexture(
      data,
      steps,
      1,
      THREE.RedFormat,
      THREE.UnsignedByteType
    )
    gradient.needsUpdate = true
    gradient.minFilter = THREE.NearestFilter
    gradient.magFilter = THREE.NearestFilter
    return new THREE.MeshToonMaterial({ color, gradientMap: gradient })
  })
}

/** Unlit flat colour — UI panels, skyboxes, anything that must not be shaded. */
export function unlit(color = PALETTE.brand, options = {}) {
  const { transparent = false, opacity = 1, side = THREE.FrontSide } = options
  const key = `unlit:${color}:${transparent}:${opacity}:${side}`
  return cached(
    key,
    () =>
      new THREE.MeshBasicMaterial({ color, transparent, opacity, side })
  )
}

/**
 * A self-lit surface. Without post-processing this reads as a bright colour;
 * with the engine's bloom pass turned on it actually glows.
 */
export function glow(color = PALETTE.brandLight, intensity = 1.6) {
  const key = `glow:${color}:${intensity}`
  return cached(
    key,
    () =>
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: intensity,
        roughness: 0.4,
        metalness: 0,
      })
  )
}

export function metal(color = PALETTE.mist, options = {}) {
  return solid(color, { roughness: 0.28, metalness: 0.9, ...options })
}

/** Transparent surface for windows, ice, force fields and water volumes. */
export function glass(color = PALETTE.sky, opacity = 0.32) {
  const key = `glass:${color}:${opacity}`
  return cached(
    key,
    () =>
      new THREE.MeshPhysicalMaterial({
        color,
        transparent: true,
        opacity,
        roughness: 0.08,
        metalness: 0,
        transmission: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
  )
}

/** Flat sprite-style material for billboards and particles. */
export function sprite(color = PALETTE.brandLight, map = null) {
  return track(
    new THREE.SpriteMaterial({
      color,
      map,
      transparent: true,
      depthWrite: false,
    })
  )
}

// --- Procedural textures ----------------------------------------------------
// Drawn on a canvas at load time so a game never waits on a network request.

function canvasTexture(size, draw, options = {}) {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = options.height || size
  const ctx = canvas.getContext("2d")
  draw(ctx, canvas)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = options.wrap ?? THREE.RepeatWrapping
  texture.wrapT = options.wrap ?? THREE.RepeatWrapping
  texture.anisotropy = 4
  if (options.nearest) {
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestMipmapLinearFilter
  }
  return texture
}

/** Vertical gradient — skies, backgrounds, fade-out planes. */
export function gradientTexture(stops = ["#fb923c", "#0b0b0f"], size = 256) {
  return canvasTexture(
    4,
    (ctx, canvas) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
      stops.forEach((color, i) => {
        gradient.addColorStop(i / Math.max(1, stops.length - 1), color)
      })
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    },
    { height: size, wrap: THREE.ClampToEdgeWrapping }
  )
}

/** Checkerboard — floors, test surfaces, retro arenas. */
export function checkerTexture(
  colorA = PALETTE.charcoal,
  colorB = PALETTE.slate,
  squares = 8
) {
  const cell = 16
  return canvasTexture(
    squares * cell,
    (ctx) => {
      for (let y = 0; y < squares; y++) {
        for (let x = 0; x < squares; x++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? colorA : colorB
          ctx.fillRect(x * cell, y * cell, cell, cell)
        }
      }
    },
    { nearest: true }
  )
}

/** Thin grid lines on a solid ground colour. */
export function gridTexture(
  background = PALETTE.charcoal,
  line = PALETTE.brand,
  size = 256,
  thickness = 3
) {
  return canvasTexture(size, (ctx) => {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = line
    ctx.lineWidth = thickness
    ctx.strokeRect(0, 0, size, size)
  })
}

/** Soft radial blob — the standard particle, glow and shadow sprite. */
export function blobTexture(color = "#ffffff", size = 128) {
  return canvasTexture(
    size,
    (ctx) => {
      const half = size / 2
      const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
      gradient.addColorStop(0, color)
      gradient.addColorStop(0.35, color)
      gradient.addColorStop(1, "rgba(0,0,0,0)")
      ctx.globalCompositeOperation = "source-over"
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, size, size)
    },
    { wrap: THREE.ClampToEdgeWrapping }
  )
}

/** Grainy monochrome noise, for subtle surface variation. */
export function noiseTexture(size = 128, contrast = 0.2) {
  return canvasTexture(size, (ctx) => {
    const image = ctx.createImageData(size, size)
    for (let i = 0; i < image.data.length; i += 4) {
      const value = 255 * (1 - contrast + Math.random() * contrast)
      image.data[i] = value
      image.data[i + 1] = value
      image.data[i + 2] = value
      image.data[i + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
  })
}

/**
 * Renders text into a texture — labels, signs, score plates, speech bubbles.
 * Returns a texture sized to a power of two so it mipmaps cleanly.
 */
export function textTexture(text, options = {}) {
  const {
    color = PALETTE.cream,
    background = "rgba(0,0,0,0)",
    font = "bold 96px ui-sans-serif, system-ui, sans-serif",
    width = 512,
    height = 256,
    padding = 16,
  } = options

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  // Shrink to fit rather than overflow the canvas.
  const maxWidth = width - padding * 2
  const measured = ctx.measureText(text).width
  if (measured > maxWidth) {
    const size = parseFloat(font) * (maxWidth / measured)
    ctx.font = font.replace(/[\d.]+px/, `${Math.max(8, Math.floor(size))}px`)
  }
  ctx.fillText(text, width / 2, height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
}

/** A world-space label that always faces the camera. */
export function textSprite(text, options = {}) {
  const { scale = 1, ...rest } = options
  const texture = textTexture(text, rest)
  const material = sprite(0xffffff, texture)
  const mesh = new THREE.Sprite(material)
  mesh.scale.set(2 * scale, 1 * scale, 1)
  mesh.userData.texture = texture
  return mesh
}

/** Frees every material and cached texture this module handed out. */
export function disposeMaterials() {
  for (const material of tracked) {
    if (material.map) material.map.dispose()
    if (material.gradientMap) material.gradientMap.dispose()
    material.dispose()
  }
  tracked.clear()
  cache.clear()
}
