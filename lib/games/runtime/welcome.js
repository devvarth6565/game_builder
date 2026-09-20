/*
  The welcome scene: a slowly turning cube in the product's colours.

  It exists to fill the preview before the first build, and it doubles as a
  smoke test — it imports the engine the same way a real game does, so if this
  renders, three.js resolved, the import map is intact and the engine loaded.

  DELETE THIS FILE (and its <script> tag in index.html) when you write the real
  game. It is a placeholder, not a foundation.
*/

import { Engine, THREE, anim, materials } from "./engine/index.js"

// Sampled from the logo: a warm orange mark whose faces are white at varying
// opacity, which lands on this ramp from bright cream to deep ember.
const FACES = {
  top: "#fbdece",
  front: "#fb923c",
  right: "#f5ac86",
  left: "#ea580c",
  back: "#ea580c",
  bottom: "#c2410c",
}

const engine = new Engine({
  container: document.getElementById("game"),
  background: "#0b0b0f",
  fov: 42,
  fog: { color: "#0b0b0f", near: 9, far: 26 },
})

const CAMERA_HEIGHT = 1.9
const LOOK_AT = new THREE.Vector3(0, 1.35, 0)
engine.camera.position.set(0, CAMERA_HEIGHT, 7.2)
engine.camera.lookAt(LOOK_AT)

// --- lighting ---------------------------------------------------------------

const key = new THREE.DirectionalLight("#fff1e4", 2.2)
key.position.set(4, 7, 5)
key.castShadow = true
key.shadow.mapSize.set(1024, 1024)
key.shadow.camera.left = -6
key.shadow.camera.right = 6
key.shadow.camera.top = 6
key.shadow.camera.bottom = -6
key.shadow.camera.far = 30
key.shadow.bias = -0.0008
key.shadow.normalBias = 0.02
engine.add(key)

// Fill from roughly where the viewer is, so the face pointed at camera is lit
// rather than sitting in ambient shadow.
const fill = new THREE.DirectionalLight("#ffd9b8", 1.5)
fill.position.set(-1.5, 2, 7)
engine.add(fill)

const rim = new THREE.PointLight("#ea580c", 34, 18, 2)
rim.position.set(-3.2, 1.8, -2.6)
engine.add(rim)

engine.add(new THREE.AmbientLight("#b9c6e0", 0.85))
engine.add(new THREE.HemisphereLight("#3c4a72", "#1a0f08", 1))

// --- the cube ---------------------------------------------------------------

const CUBE_Y = 1.45

// BoxGeometry material order is +X, -X, +Y, -Y, +Z, -Z.
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1.45, 1.45, 1.45),
  [
    materials.solid(FACES.right, { roughness: 0.42, flatShading: false }),
    materials.solid(FACES.left, { roughness: 0.42, flatShading: false }),
    materials.solid(FACES.top, { roughness: 0.34, flatShading: false }),
    materials.solid(FACES.bottom, { roughness: 0.5, flatShading: false }),
    materials.solid(FACES.front, { roughness: 0.42, flatShading: false }),
    materials.solid(FACES.back, { roughness: 0.42, flatShading: false }),
  ]
)
cube.castShadow = true
cube.position.y = CUBE_Y

// Crisp cream edges, the way the logo's facets meet.
const edges = new THREE.LineSegments(
  new THREE.EdgesGeometry(cube.geometry),
  new THREE.LineBasicMaterial({ color: "#fff7ed", transparent: true, opacity: 0.75 })
)
cube.add(edges)

const pivot = new THREE.Group()
pivot.add(cube)
engine.add(pivot)

// Three small satellites, one per logo tint, on tilted orbits.
const satellites = ["#fbdece", "#fb923c", "#ea580c"].map((color, index) => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.19, 0.19, 0.19),
    materials.solid(color, { emissive: color, emissiveIntensity: 0.45 })
  )
  mesh.castShadow = true
  engine.add(mesh)
  return {
    mesh,
    radius: 2.35 + index * 0.45,
    speed: 0.5 - index * 0.11,
    tilt: 0.3 + index * 0.32,
    phase: index * ((Math.PI * 2) / 3),
  }
})

// --- floor ------------------------------------------------------------------

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(9, 48),
  new THREE.MeshStandardMaterial({ color: "#14141c", roughness: 1, metalness: 0 })
)
floor.rotation.x = -Math.PI / 2
floor.position.y = -0.55
floor.receiveShadow = true
engine.add(floor)

// A warm pool of light under the cube, to tie it to the floor.
const glowDisc = new THREE.Mesh(
  new THREE.CircleGeometry(2.6, 48),
  new THREE.MeshBasicMaterial({
    map: materials.blobTexture("#ea580c", 256),
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  })
)
glowDisc.rotation.x = -Math.PI / 2
glowDisc.position.y = -0.54
engine.add(glowDisc)

// --- framing ----------------------------------------------------------------

// Pull the camera back on a narrow screen so the cube keeps its margins and
// never crowds the caption. engine.onResize fires for the container, not just
// the window, which is what makes this work inside the preview frame.
let distance = 7.2
engine.onResize((width, height) => {
  const aspect = width / height
  distance = aspect < 1 ? 7.2 / Math.max(0.55, aspect) : 7.2
})

// --- motion -----------------------------------------------------------------

let tiltX = 0
let tiltY = 0

engine.onUpdate((dt) => {
  const time = engine.time

  pivot.rotation.y += dt * 0.55
  pivot.rotation.x = Math.sin(time * 0.4) * 0.16

  anim.bob(cube, time, { amplitude: 0.1, speed: 1.3, base: CUBE_Y })

  // Lean toward the pointer, so the page feels alive rather than looped.
  const pointer = engine.input.pointer
  const wantX = pointer.inside ? -pointer.ndc.y * 0.18 : 0
  const wantY = pointer.inside ? pointer.ndc.x * 0.3 : 0
  tiltX = anim.damp(tiltX, wantX, 3, dt)
  tiltY = anim.damp(tiltY, wantY, 3, dt)
  engine.camera.position.x = tiltY * 2.2
  engine.camera.position.y = CAMERA_HEIGHT + tiltX * 1.6
  engine.camera.position.z = distance
  engine.camera.lookAt(LOOK_AT)

  for (const satellite of satellites) {
    const angle = time * satellite.speed + satellite.phase
    satellite.mesh.position.set(
      Math.cos(angle) * satellite.radius,
      CUBE_Y + Math.sin(angle * 1.7) * satellite.tilt,
      Math.sin(angle) * satellite.radius
    )
    satellite.mesh.rotation.x += dt * 1.1
    satellite.mesh.rotation.y += dt * 0.8
  }

  glowDisc.material.opacity = 0.34 + Math.sin(time * 1.1) * 0.07
  rim.intensity = 32 + Math.sin(time * 0.9) * 6
})

// Fade the caption in only once a frame has actually been drawn, so the page
// never shows text over an empty canvas.
const stopReveal = engine.onUpdate(() => {
  if (engine.frame < 2) return
  document.getElementById("holding")?.classList.add("is-ready")
  stopReveal()
})
