/*
  Particles and trails.

  One pooled THREE.Points object holds every particle in the game, so a
  thousand sparks cost one draw call and allocate nothing at runtime. A small
  custom shader gives each particle its own size and fade, which PointsMaterial
  cannot do.

    const fx = new Particles(engine)
    fx.burst(hitPosition, { preset: "sparks" })
    fx.burst(enemy.position, { count: 40, color: "#fb923c", speed: 9 })
*/

import * as THREE from "./three.js"

import { blobTexture, PALETTE } from "./materials.js"

const VERTEX_SHADER = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // Perspective size falloff, clamped so nearby particles stay sane.
  gl_PointSize = aSize * (320.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`

const FRAGMENT_SHADER = `
uniform sampler2D uMap;
varying float vAlpha;
varying vec3 vColor;
void main() {
  if (vAlpha <= 0.001) discard;
  vec4 tex = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor, vAlpha * tex.a);
  if (gl_FragColor.a < 0.01) discard;
}
`

/** Named looks, so a game can call for "smoke" without tuning ten numbers. */
export const PARTICLE_PRESETS = {
  sparks: { count: 24, color: PALETTE.sand, speed: 9, spread: 1, size: 0.18, life: 0.45, gravity: -18, drag: 2 },
  explosion: { count: 60, color: PALETTE.brand, speed: 12, spread: 1, size: 0.55, life: 0.7, gravity: -6, drag: 2.4, shrink: true },
  smoke: { count: 18, color: PALETTE.smoke, speed: 1.6, spread: 1, size: 0.9, life: 1.6, gravity: 1.4, drag: 1.2, grow: true },
  dust: { count: 12, color: "#d6c7a1", speed: 2.4, spread: 0.5, size: 0.34, life: 0.6, gravity: -3, drag: 3 },
  confetti: { count: 70, color: null, speed: 8, spread: 1, size: 0.24, life: 2.2, gravity: -11, drag: 1.1 },
  heal: { count: 20, color: PALETTE.leaf, speed: 2.2, spread: 0.7, size: 0.26, life: 1, gravity: 3.5, drag: 1 },
  magic: { count: 26, color: PALETTE.plum, speed: 3, spread: 1, size: 0.3, life: 1.1, gravity: 1.5, drag: 1.4 },
  blood: { count: 22, color: "#9f1239", speed: 7, spread: 1, size: 0.2, life: 0.55, gravity: -22, drag: 1 },
  bubbles: { count: 16, color: PALETTE.sky, speed: 1.4, spread: 0.6, size: 0.24, life: 1.8, gravity: 4, drag: 1.6 },
}

export class Particles {
  /**
   * @param {Engine|THREE.Scene} host the engine (it will self-update) or a bare
   *   scene (then call `update(dt)` yourself)
   * @param {object} [options] max, texture, blending ("additive"|"normal")
   */
  constructor(host, options = {}) {
    const { max = 800, texture = null, blending = "additive" } = options

    this.engine = host?.scene ? host : null
    this.scene = host?.scene || host
    this.max = max
    this.count = 0
    this._cursor = 0

    this.positions = new Float32Array(max * 3)
    this.colors = new Float32Array(max * 3)
    this.sizes = new Float32Array(max)
    this.alphas = new Float32Array(max)

    // Simulation data, kept out of the GPU buffers.
    this.velocities = new Float32Array(max * 3)
    this.life = new Float32Array(max)
    this.maxLife = new Float32Array(max)
    this.baseSize = new Float32Array(max)
    this.gravity = new Float32Array(max)
    this.drag = new Float32Array(max)
    this.mode = new Uint8Array(max) // 0 fade, 1 shrink, 2 grow

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3))
    geometry.setAttribute("aColor", new THREE.BufferAttribute(this.colors, 3))
    geometry.setAttribute("aSize", new THREE.BufferAttribute(this.sizes, 1))
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.alphas, 1))
    // Particles move everywhere; culling by a stale bounding sphere would make
    // whole bursts vanish.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)

    this.texture = texture || blobTexture("#ffffff", 64)
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.texture } },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending:
        blending === "additive" ? THREE.AdditiveBlending : THREE.NormalBlending,
    })

    this.points = new THREE.Points(geometry, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 10
    this.geometry = geometry
    this.scene.add(this.points)

    this._color = new THREE.Color()
    if (this.engine) {
      this._unsubscribe = this.engine.onUpdate((dt) => this.update(dt))
    }
  }

  /**
   * Spawns a burst at a position.
   * @param {THREE.Vector3|object} position
   * @param {object} [options] preset, count, color (or array of colors),
   *   speed, spread (0 = a beam along `direction`, 1 = a sphere), direction,
   *   size, life, gravity, drag, shrink, grow
   */
  burst(position, options = {}) {
    const preset = options.preset ? PARTICLE_PRESETS[options.preset] || {} : {}
    const {
      count = 20,
      color = PALETTE.brandLight,
      speed = 6,
      spread = 1,
      direction = null,
      size = 0.3,
      life = 0.6,
      gravity = -9,
      drag = 1.5,
      shrink = false,
      grow = false,
      spawnRadius = 0,
    } = { ...preset, ...options }

    const dir = direction
      ? new THREE.Vector3(direction.x, direction.y, direction.z).normalize()
      : null

    for (let i = 0; i < count; i++) {
      const index = this._cursor
      this._cursor = (this._cursor + 1) % this.max
      this.count = Math.min(this.max, this.count + 1)

      const p3 = index * 3

      this.positions[p3] = position.x + (Math.random() - 0.5) * spawnRadius
      this.positions[p3 + 1] = position.y + (Math.random() - 0.5) * spawnRadius
      this.positions[p3 + 2] = position.z + (Math.random() - 0.5) * spawnRadius

      // Random direction on a sphere, optionally biased toward `direction`.
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      let vx = Math.sin(phi) * Math.cos(theta)
      let vy = Math.cos(phi)
      let vz = Math.sin(phi) * Math.sin(theta)
      if (dir) {
        vx = dir.x + vx * spread
        vy = dir.y + vy * spread
        vz = dir.z + vz * spread
      }
      const magnitude = speed * (0.55 + Math.random() * 0.65)
      this.velocities[p3] = vx * magnitude
      this.velocities[p3 + 1] = vy * magnitude
      this.velocities[p3 + 2] = vz * magnitude

      const chosen = Array.isArray(color)
        ? color[(Math.random() * color.length) | 0]
        : color
      if (chosen === null) {
        this._color.setHSL(Math.random(), 0.75, 0.6)
      } else {
        this._color.set(chosen)
      }
      this.colors[p3] = this._color.r
      this.colors[p3 + 1] = this._color.g
      this.colors[p3 + 2] = this._color.b

      const particleLife = life * (0.7 + Math.random() * 0.6)
      this.life[index] = particleLife
      this.maxLife[index] = particleLife
      this.baseSize[index] = size * (0.7 + Math.random() * 0.6)
      this.sizes[index] = this.baseSize[index]
      this.alphas[index] = 1
      this.gravity[index] = gravity
      this.drag[index] = drag
      this.mode[index] = shrink ? 1 : grow ? 2 : 0
    }

    this._needsUpdate = true
    return this
  }

  /** A single particle with an exact velocity — trails, sparks off a wheel. */
  emit(position, velocity, options = {}) {
    return this.burst(position, {
      ...options,
      count: 1,
      speed: 0,
      direction: null,
      spread: 0,
      _velocity: velocity,
    })._setLastVelocity(velocity)
  }

  _setLastVelocity(velocity) {
    const index = (this._cursor - 1 + this.max) % this.max
    const p3 = index * 3
    this.velocities[p3] = velocity.x
    this.velocities[p3 + 1] = velocity.y
    this.velocities[p3 + 2] = velocity.z
    return this
  }

  update(dt) {
    if (this.count === 0) return
    let alive = 0

    for (let index = 0; index < this.max; index++) {
      const remaining = this.life[index]
      if (remaining <= 0) {
        if (this.alphas[index] !== 0) {
          this.alphas[index] = 0
          this.sizes[index] = 0
          this._needsUpdate = true
        }
        continue
      }
      alive++

      const next = remaining - dt
      this.life[index] = next
      const p3 = index * 3

      const damping = Math.max(0, 1 - this.drag[index] * dt)
      this.velocities[p3] *= damping
      this.velocities[p3 + 1] =
        this.velocities[p3 + 1] * damping + this.gravity[index] * dt
      this.velocities[p3 + 2] *= damping

      this.positions[p3] += this.velocities[p3] * dt
      this.positions[p3 + 1] += this.velocities[p3 + 1] * dt
      this.positions[p3 + 2] += this.velocities[p3 + 2] * dt

      const t = Math.max(0, next / this.maxLife[index])
      this.alphas[index] = t * t // fade out faster than linear, reads cleaner
      const base = this.baseSize[index]
      if (this.mode[index] === 1) this.sizes[index] = base * t
      else if (this.mode[index] === 2) this.sizes[index] = base * (2 - t)
      else this.sizes[index] = base
    }

    this.count = alive
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.aColor.needsUpdate = true
    this.geometry.attributes.aSize.needsUpdate = true
    this.geometry.attributes.aAlpha.needsUpdate = true
  }

  clear() {
    this.life.fill(0)
    this.alphas.fill(0)
    this.sizes.fill(0)
    this.count = 0
    this.geometry.attributes.aAlpha.needsUpdate = true
    this.geometry.attributes.aSize.needsUpdate = true
  }

  dispose() {
    this._unsubscribe?.()
    this.scene.remove(this.points)
    this.geometry.dispose()
    this.material.dispose()
    this.texture.dispose()
  }
}

/**
 * A fading ribbon behind a moving object — projectiles, dashes, vehicles.
 * Call `update(position)` each frame with where the object now is.
 */
export class Trail {
  constructor(scene, options = {}) {
    const {
      length = 24,
      color = PALETTE.brandLight,
      width = 1,
      opacity = 0.8,
    } = options

    this.length = length
    this.positions = new Float32Array(length * 3)
    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3)
    )
    this.material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      linewidth: width,
      depthWrite: false,
    })
    this.line = new THREE.Line(this.geometry, this.material)
    this.line.frustumCulled = false
    this.scene = scene
    scene.add(this.line)
    this._primed = false
  }

  update(position) {
    if (!this._primed) {
      for (let i = 0; i < this.length; i++) {
        this.positions[i * 3] = position.x
        this.positions[i * 3 + 1] = position.y
        this.positions[i * 3 + 2] = position.z
      }
      this._primed = true
    } else {
      // Shift every point back one slot and write the new head.
      this.positions.copyWithin(3, 0, (this.length - 1) * 3)
      this.positions[0] = position.x
      this.positions[1] = position.y
      this.positions[2] = position.z
    }
    this.geometry.attributes.position.needsUpdate = true
  }

  dispose() {
    this.scene.remove(this.line)
    this.geometry.dispose()
    this.material.dispose()
  }
}
