/*
  Debugging aids: a performance overlay, live tuning sliders and scene helpers.

  Useful while building, and cheap to remove: every helper returns something
  with `remove()` or `dispose()`, and the overlay only exists if you ask for it.
*/

import * as THREE from "./three.js"

import { PALETTE } from "./materials.js"

const STYLE_ID = "engine-debug-style"

const CSS = `
.dbg-panel {
  position: absolute; top: 10px; right: 10px; z-index: 50;
  min-width: 168px; padding: 10px 12px; border-radius: 10px;
  background: rgba(11, 11, 15, 0.82); border: 1px solid rgba(245, 245, 250, 0.14);
  color: ${PALETTE.mist}; font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  backdrop-filter: blur(6px); pointer-events: auto;
}
.dbg-row { display: flex; justify-content: space-between; gap: 12px; }
.dbg-row b { color: ${PALETTE.cream}; font-weight: 600; }
.dbg-row.is-warn b { color: ${PALETTE.sand}; }
.dbg-row.is-bad b { color: ${PALETTE.berry}; }
.dbg-slider { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
.dbg-slider label { display: flex; justify-content: space-between; }
.dbg-slider input { width: 100%; accent-color: ${PALETTE.brand}; }
.dbg-toggle { display: flex; align-items: center; gap: 6px; margin-top: 6px; cursor: pointer; }
`

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement("style")
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

/**
 * A live readout of frame rate and renderer load, plus any values you add.
 *
 *   const debug = new DebugOverlay(engine)
 *   debug.watch("enemies", () => enemies.length)
 *
 * Draw calls are the number that matters most: if it climbs into the thousands,
 * merge geometry or switch to InstancedMesh.
 */
export class DebugOverlay {
  constructor(engine, { container = null, interval = 0.25 } = {}) {
    injectStyles()
    this.engine = engine
    this.interval = interval
    this._elapsed = 0
    this._watchers = []

    this.el = document.createElement("div")
    this.el.className = "dbg-panel"
    ;(container || engine.container || document.body).appendChild(this.el)

    this.rows = new Map()
    this.watch("fps", () => engine.fps, (value) =>
      value < 30 ? "is-bad" : value < 50 ? "is-warn" : ""
    )
    this.watch("draws", () => engine.renderer.info.render.calls)
    this.watch("tris", () => formatCount(engine.renderer.info.render.triangles))
    this.watch("geom", () => engine.renderer.info.memory.geometries)

    this._unsubscribe = engine.onUpdate((dt) => this.update(dt))
  }

  /** Adds a line. `read()` returns the value; `grade()` may return a CSS class. */
  watch(label, read, grade = null) {
    const row = document.createElement("div")
    row.className = "dbg-row"
    const name = document.createElement("span")
    name.textContent = label
    const value = document.createElement("b")
    row.append(name, value)
    this.el.appendChild(row)
    this.rows.set(label, { row, value })
    this._watchers.push({ label, read, grade })
    return this
  }

  update(dt) {
    this._elapsed += dt
    if (this._elapsed < this.interval) return
    this._elapsed = 0
    for (const watcher of this._watchers) {
      const entry = this.rows.get(watcher.label)
      if (!entry) continue
      const value = watcher.read()
      entry.value.textContent = String(value)
      if (watcher.grade) {
        entry.row.className = `dbg-row ${watcher.grade(value) || ""}`.trim()
      }
    }
  }

  /** A slider bound to an object property — tune movement without reloading. */
  slider(object, key, { min = 0, max = 1, step = 0.01, label = key } = {}) {
    const wrap = document.createElement("div")
    wrap.className = "dbg-slider"
    const caption = document.createElement("label")
    const name = document.createElement("span")
    name.textContent = label
    const readout = document.createElement("b")
    readout.textContent = String(object[key])
    caption.append(name, readout)

    const input = document.createElement("input")
    input.type = "range"
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.value = String(object[key])
    input.addEventListener("input", () => {
      object[key] = Number(input.value)
      readout.textContent = input.value
    })

    wrap.append(caption, input)
    this.el.appendChild(wrap)
    return wrap
  }

  /** A checkbox bound to a boolean property or a callback. */
  toggle(label, initial, onChange) {
    const wrap = document.createElement("label")
    wrap.className = "dbg-toggle"
    const input = document.createElement("input")
    input.type = "checkbox"
    input.checked = !!initial
    input.addEventListener("change", () => onChange(input.checked))
    const text = document.createElement("span")
    text.textContent = label
    wrap.append(input, text)
    this.el.appendChild(wrap)
    return wrap
  }

  dispose() {
    this._unsubscribe?.()
    this.el.remove()
  }
}

function formatCount(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`
  return String(value)
}

/** Red/green/blue arrows at the origin: +X red, +Y green, +Z blue. */
export function showAxes(scene, size = 5) {
  const helper = new THREE.AxesHelper(size)
  scene.add(helper)
  return { helper, remove: () => scene.remove(helper) }
}

/** Draws the physics world's collider boxes. Toggle it when movement misbehaves. */
export function showColliders(scene, physicsWorld, color = 0x4ade80) {
  const mesh = physicsWorld.debugMesh(color)
  scene.add(mesh)
  return {
    mesh,
    /** Rebuild after the level changed. */
    refresh: () => {
      scene.remove(mesh)
      const next = physicsWorld.debugMesh(color)
      scene.add(next)
      return next
    },
    remove: () => scene.remove(mesh),
  }
}

/** Outlines an object's bounding box — check what a collider actually covers. */
export function showBounds(scene, object, color = 0xfb923c) {
  const helper = new THREE.BoxHelper(object, color)
  scene.add(helper)
  return {
    helper,
    update: () => helper.update(),
    remove: () => scene.remove(helper),
  }
}

/** Visualises a directional light's shadow frustum — the usual shadow culprit. */
export function showShadowCamera(scene, light) {
  const helper = new THREE.CameraHelper(light.shadow.camera)
  scene.add(helper)
  return { helper, remove: () => scene.remove(helper) }
}

/** Flips every material in a subtree to wireframe and back. */
export function setWireframe(root, enabled = true) {
  root.traverse((child) => {
    if (!child.isMesh) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (material) material.wireframe = enabled
    }
  })
}

/**
 * Counts objects, meshes and triangles in a subtree. Print it when a scene
 * starts to feel heavy, before guessing at what to optimise.
 */
export function sceneStats(root) {
  let objects = 0
  let meshes = 0
  let triangles = 0
  root.traverse((child) => {
    objects++
    if (!child.isMesh) return
    meshes++
    const geometry = child.geometry
    if (!geometry) return
    const instances = child.isInstancedMesh ? child.count : 1
    const count = geometry.index
      ? geometry.index.count
      : geometry.attributes.position?.count || 0
    triangles += (count / 3) * instances
  })
  return { objects, meshes, triangles: Math.round(triangles) }
}
