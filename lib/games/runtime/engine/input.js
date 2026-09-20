/*
  Unified input: keyboard, mouse, touch, pointer lock, gamepad and the virtual
  controls the HUD draws on phones — all behind one polled API.

  Polling beats event handling for games: ask "is the jump key down?" inside the
  update step rather than reacting to a keydown that arrives between frames.

    if (input.isDown("KeyW")) …
    if (input.justPressed("Space")) jump()
    const move = input.moveVector()     // {x, y} in [-1, 1], already deadzoned

  The Engine creates one of these as `engine.input` and calls `endFrame()` for
  you, which is what makes `justPressed` / `justReleased` true for exactly one
  frame.
*/

const DEFAULT_ACTIONS = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  jump: ["Space"],
  sprint: ["ShiftLeft", "ShiftRight"],
  crouch: ["ControlLeft", "KeyC"],
  fire: ["Mouse0"],
  aim: ["Mouse2"],
  interact: ["KeyE"],
  pause: ["Escape", "KeyP"],
  restart: ["KeyR"],
}

// Keys the browser would otherwise use to scroll the page.
const SWALLOWED = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "Tab",
])

export class Input {
  /**
   * @param {HTMLElement} element the canvas; pointer coordinates are relative
   *   to it, so they stay correct inside the preview iframe
   * @param {object} [options]
   * @param {object} [options.actions] name -> array of key/button codes
   * @param {boolean} [options.preventScroll] swallow arrow/space (default true)
   */
  constructor(element, options = {}) {
    const { actions = {}, preventScroll = true } = options

    this.element = element || document.body
    this.preventScroll = preventScroll
    this.actions = { ...DEFAULT_ACTIONS, ...actions }

    this.down = new Set() // codes currently held
    this.pressed = new Set() // codes that went down this frame
    this.released = new Set() // codes that came up this frame

    this.pointer = {
      x: 0, // pixels within the element
      y: 0,
      ndc: { x: 0, y: 0 }, // -1..1, ready for Raycaster.setFromCamera
      dx: 0, // movement since last frame (pointer-lock friendly)
      dy: 0,
      wheel: 0,
      inside: false,
    }

    this.touches = [] // [{id, x, y, startX, startY}]
    this.locked = false

    // Fed by HUD.touchStick() / HUD.touchButton() so phone controls and
    // keyboard controls arrive through the same API.
    this.virtualAxis = { x: 0, y: 0 }
    this.virtualLook = { x: 0, y: 0 }
    this._virtualButtons = new Set()

    this._frameStamp = 0
    this._gamepadStamp = -1
    this._gamepadButtons = []
    this._gamepadPrev = []
    this._gamepadAxes = [0, 0, 0, 0]
    this._listeners = { keydown: [], keyup: [], pointerdown: [], pointerup: [] }
    this._bound = []

    this._install()
  }

  _on(target, type, handler, options) {
    target.addEventListener(type, handler, options)
    this._bound.push([target, type, handler, options])
  }

  _install() {
    const el = this.element

    this._on(window, "keydown", (event) => {
      if (event.repeat) {
        if (this.preventScroll && SWALLOWED.has(event.code)) {
          event.preventDefault()
        }
        return
      }
      this._press(event.code)
      const alias = this._alias(event.key)
      if (alias) this._press(alias)
      for (const fn of this._listeners.keydown) fn(event)
      if (this.preventScroll && SWALLOWED.has(event.code)) {
        event.preventDefault()
      }
    })

    this._on(window, "keyup", (event) => {
      this._release(event.code)
      const alias = this._alias(event.key)
      if (alias) this._release(alias)
      for (const fn of this._listeners.keyup) fn(event)
    })

    // A dropped keyup (alt-tab, losing focus) would otherwise leave the player
    // walking forever.
    this._on(window, "blur", () => this.releaseAll())

    this._on(el, "pointerdown", (event) => {
      el.setPointerCapture?.(event.pointerId)
      this._updatePointer(event)
      this._press(`Mouse${event.button}`)
      if (event.pointerType === "touch") {
        this.touches.push({
          id: event.pointerId,
          x: this.pointer.x,
          y: this.pointer.y,
          startX: this.pointer.x,
          startY: this.pointer.y,
        })
      }
      for (const fn of this._listeners.pointerdown) fn(event, this)
    })

    this._on(window, "pointerup", (event) => {
      this._release(`Mouse${event.button}`)
      this.touches = this.touches.filter((t) => t.id !== event.pointerId)
      for (const fn of this._listeners.pointerup) fn(event, this)
    })

    this._on(el, "pointermove", (event) => {
      this._updatePointer(event)
      const touch = this.touches.find((t) => t.id === event.pointerId)
      if (touch) {
        touch.x = this.pointer.x
        touch.y = this.pointer.y
      }
    })

    this._on(el, "pointerenter", () => {
      this.pointer.inside = true
    })
    this._on(el, "pointerleave", () => {
      this.pointer.inside = false
    })

    this._on(
      el,
      "wheel",
      (event) => {
        this.pointer.wheel += event.deltaY
        event.preventDefault()
      },
      { passive: false }
    )

    // Right-click is a game button, not a context menu.
    this._on(el, "contextmenu", (event) => event.preventDefault())

    this._on(document, "pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.element
    })
  }

  // Lets isDown("w") work as well as isDown("KeyW").
  _alias(key) {
    if (!key || key.length !== 1) return null
    return key.toLowerCase()
  }

  _press(code) {
    if (!this.down.has(code)) this.pressed.add(code)
    this.down.add(code)
  }

  _release(code) {
    if (this.down.has(code)) this.released.add(code)
    this.down.delete(code)
  }

  _updatePointer(event) {
    const rect = this.element.getBoundingClientRect()
    if (this.locked) {
      // Under pointer lock the cursor does not move; only deltas are real.
      this.pointer.dx += event.movementX || 0
      this.pointer.dy += event.movementY || 0
    } else {
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      this.pointer.dx += x - this.pointer.x
      this.pointer.dy += y - this.pointer.y
      this.pointer.x = x
      this.pointer.y = y
      this.pointer.ndc.x = (x / Math.max(1, rect.width)) * 2 - 1
      this.pointer.ndc.y = -(y / Math.max(1, rect.height)) * 2 + 1
    }
    this.pointer.inside = true
  }

  // --- queries --------------------------------------------------------------

  /** True while the key, mouse button or bound action is held. */
  isDown(code) {
    const codes = this.actions[code]
    if (codes) {
      return (
        codes.some((c) => this.down.has(c)) || this._virtualButtons.has(code)
      )
    }
    return this.down.has(code) || this._virtualButtons.has(code)
  }

  /** True for the single frame the key went down. */
  justPressed(code) {
    const codes = this.actions[code]
    if (codes) return codes.some((c) => this.pressed.has(c))
    return this.pressed.has(code)
  }

  /** True for the single frame the key came up. */
  justReleased(code) {
    const codes = this.actions[code]
    if (codes) return codes.some((c) => this.released.has(c))
    return this.released.has(code)
  }

  /** Any key at all — for "press any key to start". */
  anyPressed() {
    return this.pressed.size > 0
  }

  /** -1, 0 or 1 from a pair of opposing keys or action names. */
  axis(negative, positive) {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0)
  }

  /**
   * The movement stick, merged from WASD/arrows, the gamepad left stick and the
   * HUD's virtual stick. `y` is +1 for "forward"/up.
   * @param {boolean} [normalize] clamp diagonal speed to 1 (default true)
   */
  moveVector(normalize = true) {
    let x = this.axis("left", "right") + this.virtualAxis.x
    let y = this.axis("down", "up") + this.virtualAxis.y

    const [gx, gy] = this.gamepadStick("left")
    x += gx
    y -= gy // gamepad Y is +1 when pushed down

    x = Math.max(-1, Math.min(1, x))
    y = Math.max(-1, Math.min(1, y))

    if (normalize) {
      const length = Math.hypot(x, y)
      if (length > 1) {
        x /= length
        y /= length
      }
    }
    return { x, y }
  }

  /** Look input this frame: mouse/touch drag plus the gamepad right stick. */
  lookVector(sensitivity = 1) {
    const [gx, gy] = this.gamepadStick("right")
    return {
      x: this.pointer.dx * sensitivity + this.virtualLook.x + gx * 12,
      y: this.pointer.dy * sensitivity + this.virtualLook.y + gy * 12,
    }
  }

  /** Rebind or add actions: `bind({ fire: ["Mouse0", "KeyJ"] })`. */
  bind(actions) {
    Object.assign(this.actions, actions)
    return this
  }

  // --- pointer lock ---------------------------------------------------------

  /** Request pointer lock — call it from inside a click handler. */
  lock() {
    this.element.requestPointerLock?.()
  }

  unlock() {
    document.exitPointerLock?.()
  }

  // --- gamepad --------------------------------------------------------------

  _syncGamepad() {
    if (this._gamepadStamp === this._frameStamp) return
    this._gamepadStamp = this._frameStamp

    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    let pad = null
    for (const candidate of pads) {
      if (candidate && candidate.connected) {
        pad = candidate
        break
      }
    }
    this._gamepadPrev = this._gamepadButtons
    if (!pad) {
      this._gamepadButtons = []
      this._gamepadAxes = [0, 0, 0, 0]
      return
    }
    this._gamepadButtons = pad.buttons.map((b) => b.pressed)
    this._gamepadAxes = Array.from(pad.axes)
  }

  get gamepadConnected() {
    this._syncGamepad()
    return this._gamepadButtons.length > 0
  }

  /** Deadzoned [x, y] for the "left" or "right" stick. */
  gamepadStick(side = "left", deadzone = 0.15) {
    this._syncGamepad()
    const offset = side === "right" ? 2 : 0
    const raw = [this._gamepadAxes[offset] || 0, this._gamepadAxes[offset + 1] || 0]
    const length = Math.hypot(raw[0], raw[1])
    if (length < deadzone) return [0, 0]
    // Rescale so the stick still reaches 1 at full deflection.
    const scale = (length - deadzone) / (1 - deadzone) / length
    return [raw[0] * scale, raw[1] * scale]
  }

  gamepadButton(index) {
    this._syncGamepad()
    return !!this._gamepadButtons[index]
  }

  gamepadPressed(index) {
    this._syncGamepad()
    return !!this._gamepadButtons[index] && !this._gamepadPrev[index]
  }

  // --- virtual controls (driven by HUD touch widgets) -----------------------

  setVirtualAxis(x, y) {
    this.virtualAxis.x = x
    this.virtualAxis.y = y
  }

  setVirtualLook(x, y) {
    this.virtualLook.x = x
    this.virtualLook.y = y
  }

  setVirtualButton(name, isDown) {
    if (isDown) {
      if (!this._virtualButtons.has(name)) this.pressed.add(name)
      this._virtualButtons.add(name)
    } else {
      if (this._virtualButtons.has(name)) this.released.add(name)
      this._virtualButtons.delete(name)
    }
  }

  // --- events ---------------------------------------------------------------

  /** One-shot handlers, for things that are not worth polling. */
  on(type, fn) {
    const list = this._listeners[type]
    if (!list) throw new Error(`Input: unknown event "${type}"`)
    list.push(fn)
    return () => {
      const index = list.indexOf(fn)
      if (index !== -1) list.splice(index, 1)
    }
  }

  // --- frame bookkeeping ----------------------------------------------------

  releaseAll() {
    for (const code of this.down) this.released.add(code)
    this.down.clear()
  }

  /** Called by the Engine at the end of every frame. */
  endFrame() {
    this.pressed.clear()
    this.released.clear()
    this.pointer.dx = 0
    this.pointer.dy = 0
    this.pointer.wheel = 0
    this.virtualLook.x = 0
    this.virtualLook.y = 0
    this._frameStamp++
  }

  dispose() {
    for (const [target, type, handler, options] of this._bound) {
      target.removeEventListener(type, handler, options)
    }
    this._bound.length = 0
    this.down.clear()
  }
}

/** Rough check for a touch-first device, to decide whether to show sticks. */
export function isTouchDevice() {
  return (
    typeof window !== "undefined" &&
    ("ontouchstart" in window || navigator.maxTouchPoints > 0)
  )
}
