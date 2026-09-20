/*
  Lighting presets.

  Lighting is the difference between "some shapes" and "a place", and it is also
  the easiest thing to get expensively wrong. Each preset below is a complete,
  balanced rig: one shadow-casting key light with a frustum tightened to the
  playable area, plus cheap fill that needs no shadow map at all.

    const rig = dayLight(engine, { area: 40 })
    rig.sun.position.set(30, 50, 20)
*/

import * as THREE from "./three.js"

import { PALETTE } from "./materials.js"

/**
 * Points a directional light's shadow camera at a box of `area` units around
 * the origin (or `target`). A loose frustum is the usual cause of blocky or
 * missing shadows — the same map has to cover far more ground.
 */
export function configureShadows(light, { area = 40, mapSize = 2048, far = 200, bias = -0.0005 } = {}) {
  light.castShadow = true
  light.shadow.mapSize.set(mapSize, mapSize)
  const half = area / 2
  light.shadow.camera.left = -half
  light.shadow.camera.right = half
  light.shadow.camera.top = half
  light.shadow.camera.bottom = -half
  light.shadow.camera.near = 0.5
  light.shadow.camera.far = far
  light.shadow.bias = bias
  light.shadow.normalBias = 0.03
  light.shadow.camera.updateProjectionMatrix()
  return light
}

/**
 * Keeps a directional light's shadow box centred on a moving target. Without
 * this, shadows disappear once the player walks past the edge of the frustum.
 */
export function followShadows(light, target) {
  const offset = light.position.clone().sub(light.target.position)
  return (/* dt */) => {
    const position = target.position || target
    light.target.position.copy(position)
    light.target.updateMatrixWorld()
    light.position.copy(position).add(offset)
  }
}

function attach(engine, ...lights) {
  const scene = engine.scene || engine
  for (const light of lights) {
    scene.add(light)
    if (light.target && light.target.isObject3D && !light.target.parent) {
      scene.add(light.target)
    }
  }
}

/** Bright outdoor sun with a warm sky and cool bounce from the ground. */
export function dayLight(engine, options = {}) {
  const {
    area = 50,
    intensity = 2.6,
    sunColor = "#fff4e0",
    skyColor = "#9ecbff",
    groundColor = "#5c4632",
    ambient = 0.35,
    direction = { x: 34, y: 52, z: 22 },
    shadows = true,
  } = options

  const sun = new THREE.DirectionalLight(sunColor, intensity)
  sun.position.set(direction.x, direction.y, direction.z)
  if (shadows) configureShadows(sun, { area })

  const hemisphere = new THREE.HemisphereLight(skyColor, groundColor, 1.1)
  const ambientLight = new THREE.AmbientLight(PALETTE.white, ambient)

  attach(engine, sun, hemisphere, ambientLight)
  return { sun, hemisphere, ambient: ambientLight }
}

/** Cool moonlight with a deep sky — pair it with torches for warm pools. */
export function nightLight(engine, options = {}) {
  const {
    area = 50,
    intensity = 0.5,
    moonColor = "#a5c8ff",
    ambient = 0.14,
    direction = { x: -26, y: 44, z: -18 },
    shadows = true,
  } = options

  const moon = new THREE.DirectionalLight(moonColor, intensity)
  moon.position.set(direction.x, direction.y, direction.z)
  if (shadows) configureShadows(moon, { area })

  const hemisphere = new THREE.HemisphereLight("#243b6b", "#0b0b0f", 0.5)
  const ambientLight = new THREE.AmbientLight("#5b7bb5", ambient)

  attach(engine, moon, hemisphere, ambientLight)
  return { sun: moon, moon, hemisphere, ambient: ambientLight }
}

/** Neutral three-point rig — menus, model viewers, character select. */
export function studioLight(engine, options = {}) {
  const { intensity = 2.4, shadows = true, area = 14 } = options

  const key = new THREE.DirectionalLight(PALETTE.white, intensity)
  key.position.set(5, 7, 6)
  if (shadows) configureShadows(key, { area, mapSize: 1024 })

  const fill = new THREE.DirectionalLight("#cfe0ff", intensity * 0.35)
  fill.position.set(-6, 3, 4)

  const rim = new THREE.DirectionalLight(PALETTE.brandLight, intensity * 0.5)
  rim.position.set(0, 4, -7)

  const ambientLight = new THREE.AmbientLight(PALETTE.white, 0.55)

  attach(engine, key, fill, rim, ambientLight)
  return { key, fill, rim, ambient: ambientLight, sun: key }
}

/** Near-black with a faint cold fill — build the rest from torches and lamps. */
export function dungeonLight(engine, options = {}) {
  const { ambient = 0.09, fog = true, fogColor = "#0a0a12", fogDensity = 0.045 } = options

  const ambientLight = new THREE.AmbientLight("#5468a8", ambient)
  const hemisphere = new THREE.HemisphereLight("#33406b", "#08080c", 0.25)
  attach(engine, ambientLight, hemisphere)

  if (fog && engine.setFog) engine.setFog({ color: fogColor, density: fogDensity })
  if (engine.scene) engine.scene.background = new THREE.Color(fogColor)

  return { ambient: ambientLight, hemisphere }
}

/** Hard key light, black shadows, coloured rim — space and sci-fi. */
export function spaceLight(engine, options = {}) {
  const { area = 60, intensity = 3.2, rimColor = PALETTE.plum, shadows = true } = options

  const star = new THREE.DirectionalLight("#ffffff", intensity)
  star.position.set(40, 30, 20)
  if (shadows) configureShadows(star, { area })

  const rim = new THREE.DirectionalLight(rimColor, 0.9)
  rim.position.set(-30, -10, -25)

  const ambientLight = new THREE.AmbientLight("#1b2340", 0.5)

  attach(engine, star, rim, ambientLight)
  if (engine.scene) engine.scene.background = new THREE.Color("#05060d")
  return { sun: star, rim, ambient: ambientLight }
}

/** Warm sunset with long shadows and heavy atmosphere. */
export function sunsetLight(engine, options = {}) {
  const { area = 50, intensity = 2.2, shadows = true } = options

  const sun = new THREE.DirectionalLight("#ff9d5c", intensity)
  sun.position.set(-40, 14, 26)
  if (shadows) configureShadows(sun, { area })

  const hemisphere = new THREE.HemisphereLight("#ffb07c", "#3b2a4a", 0.9)
  const ambientLight = new THREE.AmbientLight("#ffd0a8", 0.3)

  attach(engine, sun, hemisphere, ambientLight)
  if (engine.setFog) engine.setFog({ color: "#e8865a", near: 40, far: 180 })
  return { sun, hemisphere, ambient: ambientLight }
}

/**
 * A light that flickers like fire. Returns an update function to call each
 * frame — attach it to a torch or campfire.
 */
export function flicker(light, { amount = 0.3, speed = 11 } = {}) {
  const base = light.intensity
  let phase = Math.random() * 100
  return (dt) => {
    phase += dt * speed
    light.intensity =
      base * (1 - amount * 0.5 + Math.sin(phase) * 0.25 * amount + Math.random() * 0.25 * amount)
  }
}

/** Ready-made presets by name, for when the game picks a mood at runtime. */
export const LIGHTING_PRESETS = {
  day: dayLight,
  night: nightLight,
  studio: studioLight,
  dungeon: dungeonLight,
  space: spaceLight,
  sunset: sunsetLight,
}

/** `setupLighting(engine, "night", { area: 60 })` */
export function setupLighting(engine, preset = "day", options = {}) {
  const builder = LIGHTING_PRESETS[preset] || dayLight
  return builder(engine, options)
}
