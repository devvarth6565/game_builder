/*
  The Engine: renderer, scene, camera, resize handling and the frame loop.

  One Engine per game. It owns the render loop and hands your code two kinds of
  callback:

    engine.onFixed(fn)   runs at a fixed rate (60 Hz by default) — physics,
                         movement, anything that must not change behaviour when
                         the frame rate does.
    engine.onUpdate(fn)  runs once per rendered frame with the real delta —
                         cameras, animation, effects, HUD.

  Both receive seconds, never milliseconds.
*/

import * as THREE from "./three.js"
import { Input } from "./input.js"

const MAX_FRAME_DELTA = 0.25 // s — after a tab switch, never simulate a huge gap

export class Engine {
  /**
   * @param {object} [options]
   * @param {HTMLElement} [options.container] element to fill (default: body)
   * @param {HTMLCanvasElement} [options.canvas] existing canvas to render into
   * @param {number|string} [options.background] scene background colour
   * @param {object|false} [options.fog] {color, near, far} or {color, density}
   * @param {boolean} [options.shadows] enable shadow maps (default true)
   * @param {boolean} [options.antialias] (default true)
   * @param {number} [options.maxPixelRatio] (default 2)
   * @param {"perspective"|"orthographic"} [options.projection]
   * @param {number} [options.fov] perspective field of view (default 60)
   * @param {number} [options.near]
   * @param {number} [options.far]
   * @param {number} [options.frustumSize] orthographic vertical size
   * @param {number} [options.fixedStep] seconds per fixed tick (default 1/60)
   * @param {boolean} [options.autoStart] start the loop immediately (default true)
   * @param {boolean} [options.pauseWhenHidden] pause when the tab is hidden
   * @param {number} [options.toneMapping] THREE.NeutralToneMapping by default;
   *   THREE.NoToneMapping gives flat, poster-like colour
   * @param {number} [options.exposure] tone mapping exposure (default 1)
   */
  constructor(options = {}) {
    const {
      container = document.body,
      canvas = null,
      background = "#0b0b0f",
      fog = null,
      shadows = true,
      antialias = true,
      maxPixelRatio = 2,
      projection = "perspective",
      fov = 60,
      near = 0.1,
      far = 1000,
      frustumSize = 12,
      fixedStep = 1 / 60,
      autoStart = true,
      pauseWhenHidden = true,
      toneMapping = THREE.NeutralToneMapping,
      exposure = 1,
    } = options

    this.container = container
    this.maxPixelRatio = maxPixelRatio
    this.projection = projection
    this.frustumSize = frustumSize
    this.fixedStep = fixedStep
    this.pauseWhenHidden = pauseWhenHidden

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas || undefined,
      antialias,
      powerPreference: "high-performance",
      // Lets the game take a screenshot of the canvas without a re-render.
      preserveDrawingBuffer: false,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    // Neutral tone mapping keeps saturated palette colours looking like the
    // colours you asked for. ACESFilmic is the film-grade default, but it
    // desaturates bright oranges and reds into mud, which is the wrong trade
    // for a stylised game.
    this.renderer.toneMapping = toneMapping
    this.renderer.toneMappingExposure = exposure
    if (shadows) {
      this.renderer.shadowMap.enabled = true
      // PCFSoftShadowMap was removed in recent three.js and now falls back with
      // a console warning, so ask for the filter that actually exists.
      this.renderer.shadowMap.type = THREE.PCFShadowMap
    }

    this.canvas = this.renderer.domElement
    this.canvas.style.display = "block"
    this.canvas.style.width = "100%"
    this.canvas.style.height = "100%"
    this.canvas.style.touchAction = "none" // stop the browser scrolling on drag
    if (!this.canvas.parentElement) container.appendChild(this.canvas)

    this.scene = new THREE.Scene()
    if (background !== null && background !== false) {
      this.scene.background =
        background instanceof THREE.Texture
          ? background
          : new THREE.Color(background)
    }
    if (fog) this.setFog(fog)

    this.camera = this.createCamera({ projection, fov, near, far, frustumSize })
    this.scene.add(this.camera)

    this.input = new Input(this.canvas)

    // Time, exposed so game code can read it without threading it through.
    this.time = 0 // seconds since start(), excluding paused time
    this.delta = 0 // seconds since the previous rendered frame
    this.frame = 0
    this.fps = 0

    this.running = false
    this.paused = false

    this._fixedCallbacks = []
    this._updateCallbacks = []
    this._renderCallbacks = []
    this._resizeCallbacks = []
    this._accumulator = 0
    this._lastTime = 0
    this._fpsAccum = 0
    this._fpsFrames = 0
    this._rafId = 0
    this._composer = null
    this._shake = { amount: 0, decay: 1 }
    this._shakeOffset = new THREE.Vector3()
    this._disposed = false

    this._tick = this._tick.bind(this)

    this._observeResize()
    this.resize()

    this._onVisibility = () => {
      if (!this.pauseWhenHidden) return
      if (document.hidden) this.pause()
      else this.resume()
    }
    document.addEventListener("visibilitychange", this._onVisibility)

    // The preview runs the game in an iframe, where keyboard events only arrive
    // once the frame has focus. Taking focus on the first interaction is what
    // makes WASD work without the player knowing to click first.
    this._onFirstPointer = () => window.focus()
    this.canvas.addEventListener("pointerdown", this._onFirstPointer)

    if (autoStart) this.start()
  }

  createCamera({
    projection = "perspective",
    fov = 60,
    near = 0.1,
    far = 1000,
    frustumSize = 12,
  } = {}) {
    const { width, height } = this.size()
    const aspect = width / Math.max(1, height)
    if (projection === "orthographic") {
      const half = frustumSize / 2
      return new THREE.OrthographicCamera(
        -half * aspect,
        half * aspect,
        half,
        -half,
        near,
        far
      )
    }
    return new THREE.PerspectiveCamera(fov, aspect, near, far)
  }

  /** Swap in a different camera (a cutscene camera, a minimap camera). */
  setCamera(camera) {
    this.camera = camera
    if (!camera.parent) this.scene.add(camera)
    this.resize()
    return camera
  }

  setFog(fog) {
    if (!fog) {
      this.scene.fog = null
      return
    }
    const { color = "#0b0b0f", near = 10, far = 120, density } = fog
    this.scene.fog =
      density != null
        ? new THREE.FogExp2(color, density)
        : new THREE.Fog(color, near, far)
  }

  add(...objects) {
    for (const object of objects) this.scene.add(object)
    return objects[0]
  }

  remove(...objects) {
    for (const object of objects) this.scene.remove(object)
  }

  size() {
    const rect = this.container.getBoundingClientRect
      ? this.container.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight }
    return {
      width: Math.max(1, Math.floor(rect.width || window.innerWidth)),
      height: Math.max(1, Math.floor(rect.height || window.innerHeight)),
    }
  }

  /**
   * Matches the drawing buffer to the container. Called automatically by a
   * ResizeObserver, which is what makes the game fit the preview frame at any
   * size — window resize events alone do not fire when only the iframe changes.
   */
  resize() {
    const { width, height } = this.size()
    const aspect = width / height

    if (this.camera.isPerspectiveCamera) {
      this.camera.aspect = aspect
    } else if (this.camera.isOrthographicCamera) {
      const half = this.frustumSize / 2
      this.camera.left = -half * aspect
      this.camera.right = half * aspect
      this.camera.top = half
      this.camera.bottom = -half
    }
    this.camera.updateProjectionMatrix()

    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.maxPixelRatio)
    )
    this.renderer.setSize(width, height, false)
    if (this._composer) this._composer.setSize(width, height)

    for (const callback of this._resizeCallbacks) callback(width, height, this)
  }

  _observeResize() {
    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this.resize())
      this._resizeObserver.observe(this.container)
    }
    this._onWindowResize = () => this.resize()
    window.addEventListener("resize", this._onWindowResize)
    window.addEventListener("orientationchange", this._onWindowResize)
  }

  // --- callbacks ------------------------------------------------------------
  // Each returns a function that removes the callback again.

  /** Fixed-rate simulation. `fn(step, engine)` — step is always `fixedStep`. */
  onFixed(fn) {
    return this._subscribe(this._fixedCallbacks, fn)
  }

  /** Per-frame update. `fn(delta, engine)` — delta varies, in seconds. */
  onUpdate(fn) {
    return this._subscribe(this._updateCallbacks, fn)
  }

  /** Runs after update, immediately before the draw call. */
  onRender(fn) {
    return this._subscribe(this._renderCallbacks, fn)
  }

  /** `fn(width, height, engine)` whenever the canvas is resized. */
  onResize(fn) {
    return this._subscribe(this._resizeCallbacks, fn)
  }

  _subscribe(list, fn) {
    list.push(fn)
    return () => {
      const index = list.indexOf(fn)
      if (index !== -1) list.splice(index, 1)
    }
  }

  // --- loop -----------------------------------------------------------------

  start() {
    if (this.running || this._disposed) return this
    this.running = true
    this.paused = false
    this._lastTime = performance.now()
    this._accumulator = 0
    this._rafId = requestAnimationFrame(this._tick)
    return this
  }

  stop() {
    this.running = false
    if (this._rafId) cancelAnimationFrame(this._rafId)
    this._rafId = 0
    return this
  }

  /** Freezes simulation but keeps rendering, so a pause menu still draws. */
  pause() {
    this.paused = true
    return this
  }

  resume() {
    if (!this.paused) return this
    this.paused = false
    this._lastTime = performance.now()
    this._accumulator = 0
    return this
  }

  togglePause() {
    return this.paused ? this.resume() : this.pause()
  }

  _tick(now) {
    if (!this.running) return
    this._rafId = requestAnimationFrame(this._tick)

    let delta = (now - this._lastTime) / 1000
    this._lastTime = now
    if (!Number.isFinite(delta) || delta < 0) delta = 0
    delta = Math.min(delta, MAX_FRAME_DELTA)

    this._fpsAccum += delta
    this._fpsFrames++
    if (this._fpsAccum >= 0.5) {
      this.fps = Math.round(this._fpsFrames / this._fpsAccum)
      this._fpsAccum = 0
      this._fpsFrames = 0
    }

    if (!this.paused) {
      this.delta = delta
      this.time += delta
      this.frame++

      // Fixed steps first, so per-frame code sees the settled simulation.
      this._accumulator += delta
      let steps = 0
      while (this._accumulator >= this.fixedStep && steps < 5) {
        for (const callback of this._fixedCallbacks) {
          callback(this.fixedStep, this)
        }
        this._accumulator -= this.fixedStep
        steps++
      }
      // If we fell far behind (a slow device), drop the backlog instead of
      // spiralling: better to run slightly slow than to freeze.
      if (this._accumulator > this.fixedStep * 5) this._accumulator = 0

      for (const callback of this._updateCallbacks) callback(delta, this)
    } else {
      this.delta = 0
    }

    this._applyShake(delta)
    for (const callback of this._renderCallbacks) callback(delta, this)
    this.render()
    this._removeShake()

    this.input.endFrame()
  }

  render() {
    if (this._composer) this._composer.render(this.delta)
    else this.renderer.render(this.scene, this.camera)
  }

  // --- camera shake ---------------------------------------------------------

  /**
   * Kicks the camera for `duration` seconds. Call on hits, explosions and
   * landings — it is the cheapest way to make a game feel physical.
   */
  shake(amount = 0.3, duration = 0.35) {
    this._shake.amount = Math.max(this._shake.amount, amount)
    this._shake.decay = amount / Math.max(0.0001, duration)
    return this
  }

  _applyShake(delta) {
    if (this._shake.amount <= 0) return
    const a = this._shake.amount
    this._shakeOffset.set(
      (Math.random() * 2 - 1) * a,
      (Math.random() * 2 - 1) * a,
      (Math.random() * 2 - 1) * a * 0.5
    )
    this.camera.position.add(this._shakeOffset)
    this._shake.amount = Math.max(0, a - this._shake.decay * delta)
  }

  _removeShake() {
    if (this._shakeOffset.lengthSq() === 0) return
    this.camera.position.sub(this._shakeOffset)
    this._shakeOffset.set(0, 0, 0)
  }

  // --- picking --------------------------------------------------------------

  /**
   * Raycasts from the current pointer position.
   * @param {THREE.Object3D[]} objects candidates (pass a short list, not the
   *   whole scene, on anything that runs every frame)
   * @returns {object[]} three.js intersection records, nearest first
   */
  raycastFromPointer(objects, recursive = true) {
    this._raycaster = this._raycaster || new THREE.Raycaster()
    this._raycaster.setFromCamera(this.input.pointer.ndc, this.camera)
    return this._raycaster.intersectObjects(objects, recursive)
  }

  /** Where the pointer ray crosses a horizontal plane at height `y`. */
  pointerOnGround(y = 0, target = new THREE.Vector3()) {
    this._raycaster = this._raycaster || new THREE.Raycaster()
    this._groundPlane =
      this._groundPlane || new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    this._groundPlane.constant = -y
    this._raycaster.setFromCamera(this.input.pointer.ndc, this.camera)
    return this._raycaster.ray.intersectPlane(this._groundPlane, target)
  }

  /** Projects a world position to pixel coordinates — for HTML markers. */
  worldToScreen(position, target = { x: 0, y: 0, visible: true }) {
    this._projected = this._projected || new THREE.Vector3()
    this._projected.copy(position).project(this.camera)
    const { width, height } = this.size()
    target.x = ((this._projected.x + 1) / 2) * width
    target.y = ((1 - this._projected.y) / 2) * height
    target.visible = this._projected.z < 1
    return target
  }

  // --- optional post-processing ---------------------------------------------

  /**
   * Turns on bloom. Loads the post-processing addons from the CDN on demand, so
   * it only works on a page that has the three.js import map (index.html ships
   * with it). Await it; it resolves once the composer is live.
   */
  async enableBloom({ strength = 0.6, radius = 0.4, threshold = 0.85 } = {}) {
    const { THREE_ADDONS } = await import("./three.js")
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] =
      await Promise.all([
        import(`${THREE_ADDONS}postprocessing/EffectComposer.js`),
        import(`${THREE_ADDONS}postprocessing/RenderPass.js`),
        import(`${THREE_ADDONS}postprocessing/UnrealBloomPass.js`),
        import(`${THREE_ADDONS}postprocessing/OutputPass.js`),
      ])

    const { width, height } = this.size()
    const composer = new EffectComposer(this.renderer)
    composer.addPass(new RenderPass(this.scene, this.camera))
    composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(width, height),
        strength,
        radius,
        threshold
      )
    )
    composer.addPass(new OutputPass())
    composer.setSize(width, height)
    this._composer = composer
    return composer
  }

  disableBloom() {
    if (this._composer) this._composer.dispose?.()
    this._composer = null
  }

  // --- teardown -------------------------------------------------------------

  /** Frees every GPU resource under the scene. Call before rebuilding a level. */
  static disposeObject(object) {
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose()
      const materials = Array.isArray(child.material)
        ? child.material
        : child.material
          ? [child.material]
          : []
      for (const material of materials) {
        for (const key of Object.keys(material)) {
          const value = material[key]
          if (value && value.isTexture) value.dispose()
        }
        material.dispose()
      }
    })
  }

  /** Empties the scene, disposing everything except the camera and lights. */
  clearScene({ keep = [] } = {}) {
    const keepSet = new Set([this.camera, ...keep])
    for (const child of [...this.scene.children]) {
      if (keepSet.has(child)) continue
      this.scene.remove(child)
      Engine.disposeObject(child)
    }
  }

  dispose() {
    this.stop()
    this._disposed = true
    document.removeEventListener("visibilitychange", this._onVisibility)
    window.removeEventListener("resize", this._onWindowResize)
    window.removeEventListener("orientationchange", this._onWindowResize)
    this.canvas.removeEventListener("pointerdown", this._onFirstPointer)
    this._resizeObserver?.disconnect()
    this.input.dispose()
    this.clearScene()
    this.disableBloom()
    this.renderer.dispose()
    this.canvas.remove()
  }
}
