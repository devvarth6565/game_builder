/*
  Synthesised sound. No audio files, no loading, no network.

  Every effect here is built from oscillators, filtered noise and gain
  envelopes, which is enough for the whole vocabulary of arcade sound: jumps,
  coins, hits, lasers, explosions, footsteps and a looping background track.

    const sound = new Sound()
    sound.play("coin")
    sound.play("explosion", { volume: 0.8 })
    const track = sound.music({ mood: "adventure" })

  Browsers block audio until the player interacts with the page, so the context
  starts suspended and resumes itself on the first click or key press.
*/

const NOTE_OFFSETS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** "A4" -> 440. Accepts sharps and flats: "C#3", "Eb5". */
export function note(name) {
  const match = /^([A-G])([#b]?)(-?\d)$/.exec(name)
  if (!match) return 440
  const [, letter, accidental, octave] = match
  let semitone = NOTE_OFFSETS[letter]
  if (accidental === "#") semitone += 1
  if (accidental === "b") semitone -= 1
  const midi = semitone + (Number(octave) + 1) * 12
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/** Scale degrees as semitone offsets from the root. */
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}

/** Ready-made backing tracks. `music({ mood })` picks one of these. */
const MOODS = {
  adventure: { scale: "major", root: "C3", tempo: 118, pattern: [0, 2, 4, 2, 5, 4, 2, 0], wave: "triangle" },
  tense: { scale: "minor", root: "A2", tempo: 132, pattern: [0, 0, 3, 0, 5, 4, 3, 2], wave: "sawtooth" },
  calm: { scale: "pentatonic", root: "D3", tempo: 76, pattern: [0, 2, 4, 3, 2, 1, 2, 4], wave: "sine" },
  arcade: { scale: "minorPentatonic", root: "E3", tempo: 150, pattern: [0, 3, 2, 4, 0, 2, 3, 1], wave: "square" },
  boss: { scale: "phrygian", root: "E2", tempo: 140, pattern: [0, 0, 1, 0, 4, 3, 1, 0], wave: "sawtooth" },
}

export class Sound {
  constructor({ volume = 0.7, muted = false } = {}) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    this.supported = !!AudioContextClass
    this.muted = muted
    this._music = null

    if (!this.supported) return

    this.ctx = new AudioContextClass()
    this.master = this.ctx.createGain()
    this.master.gain.value = muted ? 0 : volume
    this.master.connect(this.ctx.destination)

    // Separate buses so the player can turn the music down without losing the
    // gameplay cues.
    this.sfxBus = this.ctx.createGain()
    this.sfxBus.gain.value = 1
    this.sfxBus.connect(this.master)

    this.musicBus = this.ctx.createGain()
    this.musicBus.gain.value = 0.45
    this.musicBus.connect(this.master)

    this._volume = volume
    this._installUnlock()
    this._noiseBuffer = null
  }

  _installUnlock() {
    const unlock = () => {
      if (this.ctx.state === "suspended") this.ctx.resume()
      if (this.ctx.state === "running") {
        window.removeEventListener("pointerdown", unlock)
        window.removeEventListener("keydown", unlock)
        window.removeEventListener("touchstart", unlock)
      }
    }
    window.addEventListener("pointerdown", unlock)
    window.addEventListener("keydown", unlock)
    window.addEventListener("touchstart", unlock)
  }

  /** Call from a click handler if you want audio to start before gameplay. */
  resume() {
    if (this.supported && this.ctx.state === "suspended") this.ctx.resume()
    return this
  }

  get volume() {
    return this._volume
  }

  set volume(value) {
    this._volume = value
    if (this.supported && !this.muted) this.master.gain.value = value
  }

  setMusicVolume(value) {
    if (this.supported) this.musicBus.gain.value = value
  }

  mute() {
    this.muted = true
    if (this.supported) this.master.gain.value = 0
    return this
  }

  unmute() {
    this.muted = false
    if (this.supported) this.master.gain.value = this._volume
    return this
  }

  toggleMute() {
    return this.muted ? this.unmute() : this.mute()
  }

  // --- building blocks ------------------------------------------------------

  _now() {
    return this.ctx.currentTime
  }

  _envelope(destination, { volume = 0.3, attack = 0.005, decay = 0.12, start }) {
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay)
    gain.connect(destination)
    return gain
  }

  /**
   * One oscillator note, optionally sweeping in pitch.
   * @param {object} options frequency, to (sweep target), type, volume,
   *   attack, decay, delay, pan, detune
   */
  tone(options = {}) {
    if (!this.supported || this.muted) return
    const {
      frequency = 440,
      to = null,
      type = "square",
      volume = 0.25,
      attack = 0.005,
      decay = 0.18,
      delay = 0,
      pan = 0,
      bus = this.sfxBus,
    } = options

    const start = this._now() + delay
    let destination = bus
    if (pan !== 0 && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner()
      panner.pan.value = Math.max(-1, Math.min(1, pan))
      panner.connect(bus)
      destination = panner
    }

    const gain = this._envelope(destination, { volume, attack, decay, start })
    const osc = this.ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(frequency, start)
    if (to !== null && to !== frequency) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, to),
        start + attack + decay
      )
    }
    osc.connect(gain)
    osc.start(start)
    osc.stop(start + attack + decay + 0.02)
    return osc
  }

  _noiseSource() {
    if (!this._noiseBuffer) {
      const length = this.ctx.sampleRate * 1.2
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
      this._noiseBuffer = buffer
    }
    const source = this.ctx.createBufferSource()
    source.buffer = this._noiseBuffer
    source.loop = true
    return source
  }

  /**
   * Filtered white noise — impacts, explosions, footsteps, wind, whooshes.
   * @param {object} options duration, volume, frequency, sweepTo, type
   *   ("lowpass"|"highpass"|"bandpass"), Q
   */
  noise(options = {}) {
    if (!this.supported || this.muted) return
    const {
      duration = 0.25,
      volume = 0.25,
      frequency = 1200,
      sweepTo = null,
      type = "lowpass",
      Q = 1,
      delay = 0,
      bus = this.sfxBus,
    } = options

    const start = this._now() + delay
    const filter = this.ctx.createBiquadFilter()
    filter.type = type
    filter.Q.value = Q
    filter.frequency.setValueAtTime(frequency, start)
    if (sweepTo !== null) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(20, sweepTo),
        start + duration
      )
    }

    const gain = this._envelope(bus, {
      volume,
      attack: 0.004,
      decay: duration,
      start,
    })
    filter.connect(gain)

    const source = this._noiseSource()
    source.connect(filter)
    source.start(start)
    source.stop(start + duration + 0.05)
    return source
  }

  /** Several notes at once. */
  chord(frequencies, options = {}) {
    for (const frequency of frequencies) this.tone({ ...options, frequency })
  }

  /** Notes in sequence — fanfares, menu sweeps, level-up stings. */
  sequence(frequencies, options = {}) {
    const { step = 0.08, ...rest } = options
    frequencies.forEach((frequency, index) => {
      this.tone({ ...rest, frequency, delay: (rest.delay || 0) + index * step })
    })
  }

  // --- named effects --------------------------------------------------------

  /**
   * Plays a built-in effect. Names:
   * jump, doubleJump, land, step, coin, powerup, heal, hit, hurt, explosion,
   * laser, shoot, swoosh, click, select, error, open, win, lose, spawn, tick,
   * alarm, splash.
   */
  play(name, options = {}) {
    if (!this.supported || this.muted) return
    const scale = options.volume ?? 1
    const v = (base) => base * scale

    switch (name) {
      case "jump":
        return this.tone({ frequency: 280, to: 620, type: "square", volume: v(0.22), decay: 0.16 })
      case "doubleJump":
        return this.tone({ frequency: 420, to: 880, type: "square", volume: v(0.2), decay: 0.14 })
      case "land":
        this.noise({ duration: 0.12, frequency: 700, sweepTo: 180, volume: v(0.22) })
        return this.tone({ frequency: 140, to: 70, type: "sine", volume: v(0.24), decay: 0.12 })
      case "step":
        return this.noise({ duration: 0.07, frequency: 900, sweepTo: 350, volume: v(0.09) })
      case "coin":
        this.tone({ frequency: note("E6"), type: "square", volume: v(0.18), decay: 0.07 })
        return this.tone({ frequency: note("B6"), type: "square", volume: v(0.16), decay: 0.16, delay: 0.07 })
      case "powerup":
        return this.sequence([note("C5"), note("E5"), note("G5"), note("C6")], {
          type: "square", volume: v(0.18), decay: 0.14, step: 0.07,
        })
      case "heal":
        return this.sequence([note("G4"), note("C5"), note("E5")], {
          type: "sine", volume: v(0.2), decay: 0.24, step: 0.09,
        })
      case "hit":
        this.noise({ duration: 0.14, frequency: 2200, sweepTo: 300, volume: v(0.26) })
        return this.tone({ frequency: 190, to: 60, type: "square", volume: v(0.2), decay: 0.12 })
      case "hurt":
        return this.tone({ frequency: 340, to: 90, type: "sawtooth", volume: v(0.26), decay: 0.3 })
      case "explosion":
        this.noise({ duration: 0.75, frequency: 1600, sweepTo: 60, volume: v(0.4), Q: 0.6 })
        return this.tone({ frequency: 120, to: 32, type: "sine", volume: v(0.34), decay: 0.6 })
      case "laser":
        return this.tone({ frequency: 1400, to: 260, type: "sawtooth", volume: v(0.16), decay: 0.18 })
      case "shoot":
        this.noise({ duration: 0.09, frequency: 3000, sweepTo: 800, volume: v(0.14) })
        return this.tone({ frequency: 700, to: 200, type: "square", volume: v(0.14), decay: 0.09 })
      case "swoosh":
        return this.noise({ duration: 0.3, frequency: 400, sweepTo: 2600, volume: v(0.14), type: "bandpass", Q: 1.4 })
      case "click":
        return this.tone({ frequency: 900, type: "square", volume: v(0.12), decay: 0.04 })
      case "select":
        return this.tone({ frequency: 520, to: 780, type: "square", volume: v(0.14), decay: 0.09 })
      case "error":
        return this.sequence([note("B3"), note("F3")], {
          type: "square", volume: v(0.2), decay: 0.18, step: 0.11,
        })
      case "open":
        return this.tone({ frequency: 200, to: 520, type: "triangle", volume: v(0.18), decay: 0.4 })
      case "win":
        return this.sequence(
          [note("C5"), note("E5"), note("G5"), note("C6"), note("G5"), note("C6")],
          { type: "square", volume: v(0.2), decay: 0.24, step: 0.12 }
        )
      case "lose":
        return this.sequence([note("G4"), note("E4"), note("C4"), note("G3")], {
          type: "sawtooth", volume: v(0.2), decay: 0.34, step: 0.16,
        })
      case "spawn":
        return this.tone({ frequency: 120, to: 700, type: "triangle", volume: v(0.16), decay: 0.3 })
      case "tick":
        return this.tone({ frequency: 1500, type: "square", volume: v(0.08), decay: 0.03 })
      case "alarm":
        this.tone({ frequency: 880, type: "square", volume: v(0.16), decay: 0.16 })
        return this.tone({ frequency: 660, type: "square", volume: v(0.16), decay: 0.16, delay: 0.18 })
      case "splash":
        return this.noise({ duration: 0.4, frequency: 3000, sweepTo: 400, volume: v(0.22), type: "bandpass", Q: 0.8 })
      default:
        return this.tone({ frequency: 440, volume: v(0.2) })
    }
  }

  /**
   * Positional-ish playback: pans and attenuates by where something is relative
   * to the camera. Good enough for 3D cues without the AudioListener plumbing.
   */
  playAt(name, position, camera, { maxDistance = 40, ...options } = {}) {
    if (!this.supported || this.muted) return
    const dx = position.x - camera.position.x
    const dz = position.z - camera.position.z
    const distance = Math.hypot(dx, dz, position.y - camera.position.y)
    if (distance > maxDistance) return

    const falloff = 1 - distance / maxDistance
    // Project onto the camera's right vector for left/right placement.
    const right = { x: Math.cos(camera.rotation.y), z: -Math.sin(camera.rotation.y) }
    const pan = Math.max(-1, Math.min(1, (dx * right.x + dz * right.z) / Math.max(1, distance)))
    this.play(name, { ...options, volume: (options.volume ?? 1) * falloff * falloff, pan })
  }

  // --- music ----------------------------------------------------------------

  /**
   * Starts a looping backing track. Only one plays at a time.
   *
   * @param {object} [options] mood ("adventure"|"tense"|"calm"|"arcade"|"boss"),
   *   or scale/root/tempo/pattern/wave to compose your own; `bass` adds a root
   *   note underneath.
   * @returns {{stop():void, setTempo(bpm):void}}
   */
  music(options = {}) {
    if (!this.supported) return { stop() {}, setTempo() {} }
    this.stopMusic()

    const preset = MOODS[options.mood] || MOODS.adventure
    const {
      scale = preset.scale,
      root = preset.root,
      tempo = preset.tempo,
      pattern = preset.pattern,
      wave = preset.wave,
      bass = true,
      volume = 0.14,
    } = options

    const degrees = SCALES[scale] || SCALES.major
    const rootFrequency = note(root)
    const state = { tempo, step: 0, nextTime: this._now() + 0.1, stopped: false }

    const frequencyFor = (degree) => {
      const octave = Math.floor(degree / degrees.length)
      const semitone = degrees[((degree % degrees.length) + degrees.length) % degrees.length]
      return rootFrequency * Math.pow(2, (semitone + octave * 12) / 12)
    }

    // Lookahead scheduler: a timer this coarse would sound sloppy if it
    // triggered notes directly, so it queues them on the audio clock instead.
    const schedule = () => {
      if (state.stopped) return
      const beat = 60 / state.tempo / 2
      while (state.nextTime < this._now() + 0.2) {
        const degree = pattern[state.step % pattern.length]
        this.tone({
          frequency: frequencyFor(degree + 7),
          type: wave,
          volume,
          attack: 0.01,
          decay: beat * 1.6,
          delay: Math.max(0, state.nextTime - this._now()),
          bus: this.musicBus,
        })
        if (bass && state.step % 4 === 0) {
          this.tone({
            frequency: frequencyFor(0) / 2,
            type: "triangle",
            volume: volume * 1.5,
            attack: 0.01,
            decay: beat * 3,
            delay: Math.max(0, state.nextTime - this._now()),
            bus: this.musicBus,
          })
        }
        state.nextTime += beat
        state.step++
      }
      state.timer = setTimeout(schedule, 60)
    }
    schedule()

    this._music = {
      stop: () => {
        state.stopped = true
        clearTimeout(state.timer)
        if (this._music === handle) this._music = null
      },
      setTempo: (bpm) => {
        state.tempo = bpm
      },
    }
    const handle = this._music
    return handle
  }

  stopMusic() {
    this._music?.stop()
    this._music = null
  }

  dispose() {
    this.stopMusic()
    if (this.supported) this.ctx.close()
  }
}

/** One shared instance is usually all a game needs. */
export const sound = new Sound()
