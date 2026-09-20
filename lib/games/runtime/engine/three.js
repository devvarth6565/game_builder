/*
  The one pinned copy of three.js for the whole runtime.

  Every engine module — and every game — imports three through this file rather
  than writing a CDN URL of its own. The URL below is also what the import map
  in index.html maps the bare "three" specifier to, so `import * as THREE from
  "three"` and `import * as THREE from "./engine/three.js"` resolve to the very
  same module URL. The browser keys modules by resolved URL, so the two spellings
  can never load two copies of three.js (which would break every `instanceof`
  check and silently double memory use).

  To move to another version, change BOTH the re-export below and the import map
  in index.html, and keep them identical.
*/

export * from "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js"

export const THREE_VERSION = "0.186.0"

// Base URL for the matching addons (loaders, controls, post-processing). Addons
// import the bare specifier "three" internally, so they only work when the page
// has the import map. Load one with:
//   const { GLTFLoader } = await import(`${THREE_ADDONS}loaders/GLTFLoader.js`)
export const THREE_ADDONS =
  "https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/"
