/*
  On-screen interface: scores, health bars, banners, menus and touch controls.

  The HUD is plain DOM layered over the canvas, not 3D text. That makes it
  crisp at any resolution, free to render, and trivially styleable. It injects
  its own stylesheet, so it keeps working even when the game replaces
  style.css entirely.

  Everything is placed in a nine-slot grid:

      top-left      top-center      top-right
      middle-left   center          middle-right
      bottom-left   bottom-center   bottom-right
*/

import { isTouchDevice } from "./input.js"
import { PALETTE } from "./materials.js"

const STYLE_ID = "engine-hud-style"

const CSS = `
.hud-root {
  position: absolute; inset: 0; overflow: hidden;
  pointer-events: none; user-select: none; -webkit-user-select: none;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: ${PALETTE.cream};
  font-variant-numeric: tabular-nums;
  z-index: 10;
}
.hud-root * { box-sizing: border-box; }

.hud-slot { position: absolute; display: flex; gap: 10px; padding: 16px; }
.hud-slot[data-slot^="top"] { top: 0; align-items: flex-start; }
.hud-slot[data-slot^="middle"] { top: 50%; transform: translateY(-50%); align-items: center; }
.hud-slot[data-slot^="bottom"] { bottom: 0; align-items: flex-end; }
.hud-slot[data-slot$="left"] { left: 0; flex-direction: column; align-items: flex-start; }
.hud-slot[data-slot$="right"] { right: 0; flex-direction: column; align-items: flex-end; }
.hud-slot[data-slot$="center"] { left: 50%; transform: translateX(-50%); flex-direction: column; align-items: center; }
.hud-slot[data-slot="middle-center"], .hud-slot[data-slot="center"] {
  left: 50%; top: 50%; transform: translate(-50%, -50%); flex-direction: column; align-items: center;
}

.hud-readout {
  display: flex; align-items: baseline; gap: 8px;
  padding: 6px 12px; border-radius: 10px;
  background: rgba(11, 11, 15, 0.55);
  border: 1px solid rgba(245, 245, 250, 0.1);
  backdrop-filter: blur(6px);
  font-size: 14px; line-height: 1.2;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}
.hud-readout .hud-label { color: ${PALETTE.smoke}; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
.hud-readout .hud-value { font-size: 20px; font-weight: 650; letter-spacing: -0.01em; }
.hud-readout.hud-plain { background: none; border: none; backdrop-filter: none; padding: 2px 0; }

.hud-bar { display: flex; flex-direction: column; gap: 4px; min-width: 160px; }
.hud-bar .hud-label { color: ${PALETTE.smoke}; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
.hud-bar-track {
  height: 10px; border-radius: 999px; overflow: hidden;
  background: rgba(11, 11, 15, 0.7);
  border: 1px solid rgba(245, 245, 250, 0.12);
}
.hud-bar-fill { height: 100%; width: 100%; border-radius: 999px; transition: width 140ms ease-out; background: ${PALETTE.brand}; }

.hud-pips { display: flex; gap: 5px; }
.hud-pip { width: 14px; height: 14px; border-radius: 4px; background: rgba(245,245,250,0.18); transition: background 120ms ease-out, transform 120ms ease-out; }
.hud-pip.is-full { background: ${PALETTE.brand}; transform: scale(1.06); }

.hud-banner {
  font-size: clamp(1.6rem, 6vw, 3rem); font-weight: 700; letter-spacing: -0.02em;
  text-shadow: 0 4px 24px rgba(0, 0, 0, 0.7);
  opacity: 0; transform: scale(0.92);
  transition: opacity 220ms ease-out, transform 220ms cubic-bezier(0.2, 1.4, 0.4, 1);
  text-align: center;
}
.hud-banner.is-visible { opacity: 1; transform: scale(1); }

.hud-toasts { display: flex; flex-direction: column; gap: 6px; }
.hud-toast {
  padding: 8px 14px; border-radius: 999px; font-size: 13px; font-weight: 550;
  background: rgba(11, 11, 15, 0.75); border: 1px solid rgba(245, 245, 250, 0.12);
  backdrop-filter: blur(6px);
  opacity: 0; transform: translateY(8px);
  transition: opacity 180ms ease-out, transform 180ms ease-out;
}
.hud-toast.is-visible { opacity: 1; transform: translateY(0); }

.hud-crosshair {
  width: 20px; height: 20px; position: relative; opacity: 0.85;
}
.hud-crosshair::before, .hud-crosshair::after {
  content: ""; position: absolute; background: ${PALETTE.cream};
  box-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
}
.hud-crosshair::before { left: 50%; top: 0; width: 2px; height: 100%; margin-left: -1px; }
.hud-crosshair::after { top: 50%; left: 0; height: 2px; width: 100%; margin-top: -1px; }
.hud-crosshair.hud-dot::before, .hud-crosshair.hud-dot::after { display: none; }
.hud-crosshair.hud-dot { width: 6px; height: 6px; border-radius: 50%; background: ${PALETTE.cream}; }

.hud-screen {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 14px; padding: 24px;
  text-align: center; pointer-events: auto;
  background: radial-gradient(120% 90% at 50% 40%, rgba(11,11,15,0.72), rgba(11,11,15,0.94));
  backdrop-filter: blur(8px);
  opacity: 0; transition: opacity 200ms ease-out;
}
.hud-screen.is-visible { opacity: 1; }
.hud-screen h1 {
  margin: 0; font-size: clamp(1.8rem, 7vw, 3.2rem); font-weight: 700; letter-spacing: -0.03em;
}
.hud-screen h1 .hud-accent { color: ${PALETTE.brand}; }
.hud-screen p { margin: 0; max-width: 30rem; color: ${PALETTE.mist}; font-size: clamp(0.9rem, 3.4vw, 1.05rem); line-height: 1.55; }
.hud-screen .hud-stat-row { display: flex; gap: 22px; flex-wrap: wrap; justify-content: center; margin: 4px 0 2px; }
.hud-screen .hud-stat { display: flex; flex-direction: column; gap: 2px; }
.hud-screen .hud-stat b { font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; }
.hud-screen .hud-stat span { font-size: 11px; letter-spacing: 0.09em; text-transform: uppercase; color: ${PALETTE.smoke}; }
.hud-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }

.hud-button {
  pointer-events: auto; cursor: pointer; font: inherit;
  padding: 11px 22px; border-radius: 999px; font-weight: 600; font-size: 15px;
  color: ${PALETTE.cream}; background: rgba(245, 245, 250, 0.08);
  border: 1px solid rgba(245, 245, 250, 0.18);
  transition: background 140ms ease-out, transform 100ms ease-out, border-color 140ms ease-out;
}
.hud-button:hover { background: rgba(245, 245, 250, 0.16); }
.hud-button:active { transform: scale(0.96); }
.hud-button.is-primary { background: ${PALETTE.brand}; border-color: ${PALETTE.brandLight}; color: #fff; }
.hud-button.is-primary:hover { background: ${PALETTE.brandLight}; }
.hud-button:focus-visible { outline: 2px solid ${PALETTE.brandLight}; outline-offset: 3px; }

.hud-hint { font-size: 12px; color: ${PALETTE.smoke}; letter-spacing: 0.02em; }
.hud-hint kbd {
  display: inline-block; padding: 1px 6px; margin: 0 2px; border-radius: 5px;
  background: rgba(245,245,250,0.1); border: 1px solid rgba(245,245,250,0.18);
  font: inherit; font-size: 11px; color: ${PALETTE.mist};
}

.hud-stick {
  position: absolute; bottom: 26px; width: 118px; height: 118px; border-radius: 50%;
  background: rgba(245, 245, 250, 0.07); border: 1px solid rgba(245, 245, 250, 0.16);
  pointer-events: auto; touch-action: none;
}
.hud-stick[data-side="left"] { left: 26px; }
.hud-stick[data-side="right"] { right: 26px; }
.hud-stick-knob {
  position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px;
  border-radius: 50%; background: rgba(245, 245, 250, 0.3);
  border: 1px solid rgba(245, 245, 250, 0.35);
}
.hud-touch-button {
  position: absolute; width: 74px; height: 74px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 650; letter-spacing: 0.04em;
  background: rgba(234, 88, 12, 0.32); border: 1px solid rgba(251, 146, 60, 0.6);
  pointer-events: auto; touch-action: none; color: ${PALETTE.cream};
}
.hud-touch-button.is-active { background: rgba(234, 88, 12, 0.6); }

.hud-marker { position: absolute; transform: translate(-50%, -50%); white-space: nowrap; font-size: 12px; }

.hud-flash { position: absolute; inset: 0; opacity: 0; transition: opacity 120ms ease-out; }

@media (max-width: 520px) {
  .hud-slot { padding: 10px; }
  .hud-bar { min-width: 120px; }
}
`

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement("style")
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

export class HUD {
  /**
   * @param {HTMLElement} [container] the element the canvas fills; the HUD is
   *   appended on top of it (make sure it is positioned)
   */
  constructor(container = document.body) {
    injectStyles()
    this.container = container
    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative"
    }

    this.root = element("div", "hud-root")
    container.appendChild(this.root)
    this.slots = new Map()
    this.items = new Map()
    this._screens = []
    this._toastHost = null
  }

  slot(name) {
    let node = this.slots.get(name)
    if (!node) {
      node = element("div", "hud-slot")
      node.dataset.slot = name
      this.root.appendChild(node)
      this.slots.set(name, node)
    }
    return node
  }

  // --- readouts -------------------------------------------------------------

  /**
   * A labelled number or string: score, lives, timer, ammo.
   * @returns {{set(value):void, el:HTMLElement, remove():void}}
   */
  text(id, options = {}) {
    const {
      slot = "top-left",
      label = "",
      value = "",
      prefix = "",
      suffix = "",
      plain = false,
    } = options

    const node = element("div", `hud-readout${plain ? " hud-plain" : ""}`)
    const labelNode = label ? element("span", "hud-label", label) : null
    const valueNode = element("span", "hud-value")
    if (labelNode) node.appendChild(labelNode)
    node.appendChild(valueNode)
    this.slot(slot).appendChild(node)

    const handle = {
      el: node,
      set(next) {
        valueNode.textContent = `${prefix}${next}${suffix}`
        return handle
      },
      setLabel(next) {
        if (labelNode) labelNode.textContent = next
        return handle
      },
      show() {
        node.style.display = ""
        return handle
      },
      hide() {
        node.style.display = "none"
        return handle
      },
      remove: () => {
        node.remove()
        this.items.delete(id)
      },
    }
    handle.set(value)
    this.items.set(id, handle)
    return handle
  }

  /**
   * A proportional bar: health, stamina, a charge meter, a level timer.
   * Pass `max` and call `set(current)`.
   */
  bar(id, options = {}) {
    const {
      slot = "top-left",
      label = "",
      value = 1,
      max = 1,
      color = PALETTE.brand,
      lowColor = PALETTE.berry,
      lowAt = 0.25,
      width = null,
    } = options

    const node = element("div", "hud-bar")
    if (width) node.style.minWidth = `${width}px`
    if (label) node.appendChild(element("span", "hud-label", label))
    const track = element("div", "hud-bar-track")
    const fill = element("div", "hud-bar-fill")
    fill.style.background = color
    track.appendChild(fill)
    node.appendChild(track)
    this.slot(slot).appendChild(node)

    const handle = {
      el: node,
      max,
      set(current, nextMax) {
        if (nextMax != null) handle.max = nextMax
        const ratio = Math.max(0, Math.min(1, current / handle.max))
        fill.style.width = `${ratio * 100}%`
        fill.style.background = ratio <= lowAt ? lowColor : color
        return handle
      },
      show() {
        node.style.display = ""
        return handle
      },
      hide() {
        node.style.display = "none"
        return handle
      },
      remove: () => {
        node.remove()
        this.items.delete(id)
      },
    }
    handle.set(value)
    this.items.set(id, handle)
    return handle
  }

  /** Discrete pips — hearts, lives, shields. Reads better than a bar for small counts. */
  pips(id, options = {}) {
    const { slot = "top-left", count = 3, color = PALETTE.brand, label = "" } = options
    const node = element("div", "hud-bar")
    if (label) node.appendChild(element("span", "hud-label", label))
    const row = element("div", "hud-pips")
    node.appendChild(row)
    this.slot(slot).appendChild(node)

    const pips = []
    const build = (total) => {
      row.textContent = ""
      pips.length = 0
      for (let i = 0; i < total; i++) {
        const pip = element("div", "hud-pip")
        pip.style.setProperty("--pip-color", color)
        row.appendChild(pip)
        pips.push(pip)
      }
    }
    build(count)

    const handle = {
      el: node,
      set(filled, total) {
        if (total != null && total !== pips.length) build(total)
        pips.forEach((pip, i) => {
          pip.classList.toggle("is-full", i < filled)
          if (i < filled) pip.style.background = color
          else pip.style.background = ""
        })
        return handle
      },
      remove: () => {
        node.remove()
        this.items.delete(id)
      },
    }
    handle.set(count)
    this.items.set(id, handle)
    return handle
  }

  /** Aiming reticle for first-person games. `style`: "cross" or "dot". */
  crosshair(style = "cross") {
    const node = element("div", `hud-crosshair${style === "dot" ? " hud-dot" : ""}`)
    this.slot("center").appendChild(node)
    return {
      el: node,
      show: () => (node.style.display = ""),
      hide: () => (node.style.display = "none"),
      remove: () => node.remove(),
    }
  }

  /** A line of control hints. `hint("Move <kbd>WASD</kbd> · Jump <kbd>Space</kbd>")` */
  hint(html, slot = "bottom-center") {
    const node = element("div", "hud-hint")
    node.innerHTML = html
    this.slot(slot).appendChild(node)
    return { el: node, remove: () => node.remove() }
  }

  // --- transient messages ---------------------------------------------------

  /** Big centred text that fades in and out — "Level 2", "Go!", "Wave cleared". */
  banner(text, { duration = 1.4, slot = "center" } = {}) {
    const node = element("div", "hud-banner", text)
    this.slot(slot).appendChild(node)
    requestAnimationFrame(() => node.classList.add("is-visible"))
    if (duration > 0) {
      setTimeout(() => {
        node.classList.remove("is-visible")
        setTimeout(() => node.remove(), 300)
      }, duration * 1000)
    }
    return { el: node, remove: () => node.remove() }
  }

  /** A small notification that stacks and expires — pickups, objectives. */
  toast(text, { duration = 2 } = {}) {
    if (!this._toastHost) {
      this._toastHost = element("div", "hud-toasts")
      this.slot("bottom-right").appendChild(this._toastHost)
    }
    const node = element("div", "hud-toast", text)
    this._toastHost.appendChild(node)
    requestAnimationFrame(() => node.classList.add("is-visible"))
    setTimeout(() => {
      node.classList.remove("is-visible")
      setTimeout(() => node.remove(), 220)
    }, duration * 1000)
    return node
  }

  /** Tints the whole screen for a moment — damage (red), heal (green), pickup. */
  flashScreen(color = "rgba(225, 29, 72, 0.35)", duration = 0.18) {
    const node = element("div", "hud-flash")
    node.style.background = color
    this.root.appendChild(node)
    requestAnimationFrame(() => (node.style.opacity = "1"))
    setTimeout(() => {
      node.style.opacity = "0"
      setTimeout(() => node.remove(), 200)
    }, duration * 1000)
  }

  // --- full-screen panels ---------------------------------------------------

  /**
   * A modal screen: title screen, pause menu, game over. Buttons are focusable
   * and respond to Enter, so the game stays keyboard-playable.
   *
   *   hud.screen({
   *     title: "Ember Run",
   *     body: "Reach the gate before the fire does.",
   *     stats: [{ label: "Best", value: 1240 }],
   *     actions: [{ label: "Play", primary: true, onSelect: start }],
   *   })
   *
   * @returns {{close():void, el:HTMLElement}}
   */
  screen(options = {}) {
    const {
      title = "",
      accent = "",
      body = "",
      stats = [],
      actions = [],
      hint = "",
      closeOnAction = true,
      dismissible = false,
    } = options

    const node = element("div", "hud-screen")

    if (title || accent) {
      const heading = element("h1")
      heading.textContent = title
      if (accent) {
        const span = element("span", "hud-accent", accent)
        heading.appendChild(document.createTextNode(title ? " " : ""))
        heading.appendChild(span)
      }
      node.appendChild(heading)
    }
    if (body) node.appendChild(element("p", null, body))

    if (stats.length > 0) {
      const row = element("div", "hud-stat-row")
      for (const stat of stats) {
        const cell = element("div", "hud-stat")
        cell.appendChild(element("b", null, String(stat.value)))
        cell.appendChild(element("span", null, stat.label))
        row.appendChild(cell)
      }
      node.appendChild(row)
    }

    const handle = {
      el: node,
      close: () => {
        node.classList.remove("is-visible")
        setTimeout(() => node.remove(), 220)
        const index = this._screens.indexOf(handle)
        if (index !== -1) this._screens.splice(index, 1)
        window.removeEventListener("keydown", onKey)
      },
    }

    if (actions.length > 0) {
      const row = element("div", "hud-actions")
      actions.forEach((action, index) => {
        const button = element("button", "hud-button", action.label)
        button.type = "button"
        if (action.primary || (index === 0 && actions.length === 1)) {
          button.classList.add("is-primary")
        }
        button.addEventListener("click", () => {
          if (closeOnAction) handle.close()
          action.onSelect?.()
        })
        row.appendChild(button)
      })
      node.appendChild(row)
    }

    if (hint) {
      const hintNode = element("div", "hud-hint")
      hintNode.innerHTML = hint
      node.appendChild(hintNode)
    }

    // Any key dismisses when the screen is a simple "press to start".
    const onKey = (event) => {
      if (dismissible && (event.code === "Space" || event.code === "Enter")) {
        event.preventDefault()
        const first = actions[0]
        handle.close()
        first?.onSelect?.()
      }
    }
    window.addEventListener("keydown", onKey)

    this.root.appendChild(node)
    this._screens.push(handle)
    requestAnimationFrame(() => {
      node.classList.add("is-visible")
      node.querySelector(".hud-button.is-primary, .hud-button")?.focus()
    })
    return handle
  }

  /** Closes every open modal — useful when restarting. */
  closeScreens() {
    for (const screen of [...this._screens]) screen.close()
  }

  // --- touch controls -------------------------------------------------------

  /**
   * An on-screen analogue stick. The left stick drives `input.moveVector()` and
   * the right one drives `input.lookVector()`, so game code needs no separate
   * mobile path at all.
   */
  touchStick({ side = "left", input, radius = 52 } = {}) {
    if (!input) throw new Error("HUD.touchStick needs the engine's input")

    const node = element("div", "hud-stick")
    node.dataset.side = side
    const knob = element("div", "hud-stick-knob")
    node.appendChild(knob)
    this.root.appendChild(node)

    let pointerId = null
    let originX = 0
    let originY = 0

    const reset = () => {
      pointerId = null
      knob.style.transform = ""
      if (side === "left") input.setVirtualAxis(0, 0)
    }

    node.addEventListener("pointerdown", (event) => {
      pointerId = event.pointerId
      node.setPointerCapture(event.pointerId)
      const rect = node.getBoundingClientRect()
      originX = rect.left + rect.width / 2
      originY = rect.top + rect.height / 2
      event.stopPropagation()
    })

    node.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId) return
      let dx = event.clientX - originX
      let dy = event.clientY - originY
      const distance = Math.hypot(dx, dy)
      if (distance > radius) {
        dx = (dx / distance) * radius
        dy = (dy / distance) * radius
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`

      if (side === "left") {
        // Screen-down is positive, but "up" on the stick means forward.
        input.setVirtualAxis(dx / radius, -dy / radius)
      } else {
        input.setVirtualLook(
          input.virtualLook.x + (dx / radius) * 6,
          input.virtualLook.y + (dy / radius) * 6
        )
      }
      event.stopPropagation()
    })

    const end = (event) => {
      if (event.pointerId !== pointerId) return
      reset()
    }
    node.addEventListener("pointerup", end)
    node.addEventListener("pointercancel", end)

    return { el: node, remove: () => (reset(), node.remove()) }
  }

  /**
   * A round touch button wired to an input action, so `input.isDown("jump")`
   * and `input.justPressed("jump")` work from touch exactly as from a key.
   */
  touchButton({ label = "JUMP", action = "jump", input, x = 26, y = 110, side = "right" } = {}) {
    if (!input) throw new Error("HUD.touchButton needs the engine's input")

    const node = element("div", "hud-touch-button", label)
    node.style[side] = `${x}px`
    node.style.bottom = `${y}px`
    this.root.appendChild(node)

    const press = (event) => {
      node.setPointerCapture?.(event.pointerId)
      node.classList.add("is-active")
      input.setVirtualButton(action, true)
      event.stopPropagation()
      event.preventDefault()
    }
    const release = (event) => {
      node.classList.remove("is-active")
      input.setVirtualButton(action, false)
      event.stopPropagation()
    }
    node.addEventListener("pointerdown", press)
    node.addEventListener("pointerup", release)
    node.addEventListener("pointercancel", release)
    node.addEventListener("pointerleave", release)

    return { el: node, remove: () => node.remove() }
  }

  /**
   * Adds a movement stick and action buttons, but only on a touch device.
   * One call gives a game full mobile controls.
   */
  touchControls({ input, buttons = [{ label: "JUMP", action: "jump" }], look = false } = {}) {
    if (!isTouchDevice()) return null
    const created = [this.touchStick({ side: "left", input })]
    if (look) created.push(this.touchStick({ side: "right", input }))
    buttons.forEach((button, index) => {
      created.push(
        this.touchButton({
          ...button,
          input,
          x: 26 + index * 84,
          y: look ? 160 : 110,
        })
      )
    })
    return {
      remove: () => created.forEach((item) => item.remove()),
    }
  }

  // --- world-anchored labels ------------------------------------------------

  /**
   * An HTML label pinned to a world position — quest markers, damage numbers,
   * enemy names. Call `update()` every frame with the engine.
   */
  marker(text, { slot = null, className = "hud-marker" } = {}) {
    const node = element("div", className, text)
    node.style.position = "absolute"
    ;(slot ? this.slot(slot) : this.root).appendChild(node)

    return {
      el: node,
      setText(next) {
        node.textContent = next
      },
      /** @param {Engine} engine @param {THREE.Vector3} position */
      update(engine, position) {
        const screen = engine.worldToScreen(position)
        node.style.display = screen.visible ? "" : "none"
        node.style.left = `${screen.x}px`
        node.style.top = `${screen.y}px`
      },
      remove: () => node.remove(),
    }
  }

  // --- lifecycle ------------------------------------------------------------

  get(id) {
    return this.items.get(id)
  }

  show() {
    this.root.style.display = ""
  }

  hide() {
    this.root.style.display = "none"
  }

  /** Removes every widget but keeps the HUD usable. */
  clear() {
    this.closeScreens()
    this.root.textContent = ""
    this.slots.clear()
    this.items.clear()
    this._toastHost = null
  }

  dispose() {
    this.root.remove()
    this.slots.clear()
    this.items.clear()
  }
}
