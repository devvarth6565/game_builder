/*
  Game state: screens and phases, score keeping, saved progress, timers and
  object pools.

  A game that only ever "runs" is hard to add a title screen to later. Modelling
  phases explicitly from the start — menu, playing, paused, gameover — keeps the
  update loop honest about what should and should not be simulated.
*/

/** Minimal event emitter. `on` returns an unsubscribe function. */
export class Events {
  constructor() {
    this._handlers = new Map()
  }

  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, [])
    this._handlers.get(type).push(fn)
    return () => this.off(type, fn)
  }

  once(type, fn) {
    const off = this.on(type, (...args) => {
      off()
      fn(...args)
    })
    return off
  }

  off(type, fn) {
    const list = this._handlers.get(type)
    if (!list) return
    const index = list.indexOf(fn)
    if (index !== -1) list.splice(index, 1)
  }

  emit(type, ...args) {
    const list = this._handlers.get(type)
    if (!list) return
    // Copy first: a handler may unsubscribe itself while we iterate.
    for (const fn of [...list]) fn(...args)
  }

  clear() {
    this._handlers.clear()
  }
}

/**
 * A finite state machine for game phases.
 *
 *   const phase = new StateMachine({
 *     initial: "menu",
 *     states: {
 *       menu:    { enter: showMenu, exit: hideMenu },
 *       playing: { update: (dt) => stepGame(dt) },
 *       gameover:{ enter: showResults },
 *     },
 *   })
 *   engine.onUpdate((dt) => phase.update(dt))
 */
export class StateMachine extends Events {
  constructor({ initial, states = {} } = {}) {
    super()
    this.states = states
    this.current = null
    this.previous = null
    this.elapsed = 0
    if (initial) this.set(initial)
  }

  is(name) {
    return this.current === name
  }

  /** Switches state, running `exit` on the old one and `enter` on the new. */
  set(name, payload) {
    if (name === this.current) return this
    const from = this.current
    this.states[from]?.exit?.(payload, name)
    this.previous = from
    this.current = name
    this.elapsed = 0
    this.states[name]?.enter?.(payload, from)
    this.emit("change", name, from)
    return this
  }

  /** Returns to whatever state we came from — pause and unpause, for instance. */
  back(payload) {
    if (this.previous) this.set(this.previous, payload)
    return this
  }

  update(dt) {
    this.elapsed += dt
    this.states[this.current]?.update?.(dt, this)
  }
}

// localStorage can throw outright (private browsing, blocked storage, a
// sandboxed frame), so every access is guarded. A save that silently does
// nothing beats a game that refuses to start.
export const storage = {
  available() {
    try {
      const probe = "__engine_probe__"
      window.localStorage.setItem(probe, "1")
      window.localStorage.removeItem(probe)
      return true
    } catch {
      return false
    }
  },

  load(key, fallback = null) {
    try {
      const raw = window.localStorage.getItem(key)
      return raw === null ? fallback : JSON.parse(raw)
    } catch {
      return fallback
    }
  },

  save(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  },

  remove(key) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* nothing to do */
    }
  },
}

/**
 * Score, lives, level and elapsed time, with the high score persisted.
 * Emits "score", "lives", "level", "death" and "gameover".
 *
 *   const state = new GameState({ lives: 3, saveKey: "ember-run" })
 *   state.on("gameover", () => showResults(state.score, state.best))
 */
export class GameState extends Events {
  constructor(options = {}) {
    super()
    const { lives = 3, score = 0, level = 1, saveKey = "game" } = options

    this.saveKey = saveKey
    this.startingLives = lives
    this.startingLevel = level
    this.startingScore = score

    this.score = score
    this.lives = lives
    this.level = level
    this.time = 0
    this.over = false

    const saved = storage.load(`${saveKey}:progress`, {})
    this.best = saved.best || 0
    this.unlocked = saved.unlocked || 1
  }

  addScore(amount) {
    this.score += amount
    if (this.score > this.best) {
      this.best = this.score
      this.persist()
    }
    this.emit("score", this.score, amount)
    return this.score
  }

  loseLife(amount = 1) {
    this.lives = Math.max(0, this.lives - amount)
    this.emit("lives", this.lives)
    this.emit("death", this.lives)
    if (this.lives === 0) this.endGame()
    return this.lives
  }

  gainLife(amount = 1) {
    this.lives += amount
    this.emit("lives", this.lives)
    return this.lives
  }

  nextLevel() {
    this.level++
    this.unlocked = Math.max(this.unlocked, this.level)
    this.persist()
    this.emit("level", this.level)
    return this.level
  }

  endGame(won = false) {
    if (this.over) return
    this.over = true
    this.persist()
    this.emit("gameover", { score: this.score, best: this.best, won })
  }

  /** Advances the clock. Call from the engine's update while playing. */
  tick(dt) {
    if (!this.over) this.time += dt
  }

  reset() {
    this.score = this.startingScore
    this.lives = this.startingLives
    this.level = this.startingLevel
    this.time = 0
    this.over = false
    this.emit("reset")
    this.emit("score", this.score, 0)
    this.emit("lives", this.lives)
    return this
  }

  persist() {
    storage.save(`${this.saveKey}:progress`, {
      best: this.best,
      unlocked: this.unlocked,
    })
  }

  /** mm:ss, for a HUD timer. */
  get clock() {
    const total = Math.floor(this.time)
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    return `${minutes}:${String(seconds).padStart(2, "0")}`
  }
}

/** A persisted leaderboard, newest-best first. */
export class HighScores {
  constructor(key = "game:scores", limit = 10) {
    this.key = key
    this.limit = limit
    this.entries = storage.load(key, [])
  }

  add(score, name = "You") {
    this.entries.push({ score, name, at: Date.now() })
    this.entries.sort((a, b) => b.score - a.score)
    this.entries = this.entries.slice(0, this.limit)
    storage.save(this.key, this.entries)
    return this.entries
  }

  get best() {
    return this.entries[0]?.score ?? 0
  }

  /** True if this score would make the table — worth celebrating in the UI. */
  qualifies(score) {
    return this.entries.length < this.limit || score > (this.entries.at(-1)?.score ?? 0)
  }

  clear() {
    this.entries = []
    storage.remove(this.key)
  }
}

/**
 * A repeating or one-shot countdown, in seconds.
 *
 *   const shot = new Cooldown(0.25)
 *   if (input.isDown("fire") && shot.ready(dt)) fire()
 */
export class Cooldown {
  constructor(duration = 1) {
    this.duration = duration
    this.remaining = 0
  }

  /** Advances the clock and returns true (once) when it has elapsed. */
  ready(dt) {
    this.remaining -= dt
    if (this.remaining <= 0) {
      this.remaining = this.duration
      return true
    }
    return false
  }

  /** True when nothing is pending. Pair with `trigger()` for manual control. */
  get isReady() {
    return this.remaining <= 0
  }

  trigger() {
    this.remaining = this.duration
  }

  tick(dt) {
    this.remaining = Math.max(0, this.remaining - dt)
    return this.remaining
  }

  reset() {
    this.remaining = 0
  }

  get progress() {
    return 1 - Math.max(0, this.remaining) / this.duration
  }
}

/** Calls `fn` every `interval` seconds. Use for spawners and wave timers. */
export class Ticker {
  constructor(interval, fn) {
    this.interval = interval
    this.fn = fn
    this.elapsed = 0
    this.enabled = true
  }

  update(dt) {
    if (!this.enabled) return
    this.elapsed += dt
    while (this.elapsed >= this.interval) {
      this.elapsed -= this.interval
      this.fn(this)
    }
  }
}

/**
 * Object pool. Allocating meshes mid-game causes stutter as the garbage
 * collector catches up; recycling them does not.
 *
 *   const bullets = new Pool(() => makeBullet(), (b) => (b.visible = false))
 *   const bullet = bullets.get()
 *   bullets.release(bullet)
 */
export class Pool {
  /**
   * @param {Function} factory creates a new item when the pool is empty
   * @param {Function} [reset] prepares an item for reuse (or for storage)
   * @param {number} [prefill] how many to build up front
   */
  constructor(factory, reset = null, prefill = 0) {
    this.factory = factory
    this.reset = reset
    this.free = []
    this.used = new Set()
    for (let i = 0; i < prefill; i++) this.free.push(factory())
  }

  get() {
    const item = this.free.pop() || this.factory()
    this.used.add(item)
    return item
  }

  release(item) {
    if (!this.used.delete(item)) return
    this.reset?.(item)
    this.free.push(item)
  }

  releaseAll() {
    for (const item of this.used) {
      this.reset?.(item)
      this.free.push(item)
    }
    this.used.clear()
  }

  /** Iterate live items safely, releasing as you go. */
  forEach(fn) {
    for (const item of [...this.used]) fn(item, this)
  }

  get activeCount() {
    return this.used.size
  }
}
