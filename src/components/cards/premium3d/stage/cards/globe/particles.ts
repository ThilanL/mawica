import * as THREE from "three";
import { SMOKE, flakeAt, makeFlakes, smokeAt, type Flake } from "./motion";

/**
 * Point renderers for the snow inside the glass and the chimney smoke. Positions come from motion.ts each frame (CPU, a few hundred points).
 * Sizes are in model metres and stay correct at any zoom; flakes are soft discs with a bright core, glitter flakes catch the light.
 */
const VERT = /* glsl */ `
  attribute float aSize; attribute float aAlpha; attribute float aGlint;
  uniform float uPx; uniform float uScale; uniform float uTime; uniform float uSizeK;
  varying float vAlpha; varying float vGlint;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uSizeK * uScale * uPx / max(0.001, -mv.z), 1.0, 96.0);
    vAlpha = aAlpha; vGlint = aGlint * (0.55 + 0.45 * sin(uTime * 7.0 + position.x * 900.0 + position.z * 700.0));
    gl_Position = projectionMatrix * mv;
  }`;
const SNOW_FRAG = /* glsl */ `
  uniform vec3 uColor; varying float vAlpha; varying float vGlint;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = 1.0 - smoothstep(0.25, 1.0, d); // (smoothstep needs edge0 < edge1)
    a = a * a * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * (1.0 + vGlint * 2.2), a);
  }`;
/**
 * Blending without the "transparent" flag: the desktop glass refracts only what is drawn in the opaque pass, and it writes depth, so anything
 * inside it that waits for the transparent pass would be hidden. Drawn in the opaque pass (late, by renderOrder) and blended by alpha, the
 * snow and smoke are captured into the refraction and seen through the glass like everything else inside it.
 */
const INSIDE_GLASS = { transparent: false, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor } as const;

const SMOKE_FRAG = /* glsl */ `
  uniform vec3 uColor; varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0;
    float n = 0.85 + 0.15 * sin(p.x * 19.0 + p.y * 13.0); // a little texture so the puffs are not perfect discs
    float a = (1.0 - smoothstep(0.0, 1.0, d)) * n * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }`;

export type Snow = { points: THREE.Points; update(t: number, energy: number, age: number): void; dispose(): void; flakes: Flake[] };

/** `sizeK`: flake size multiplier (phones get larger flakes so the snow reads on a small screen). */
export function createSnow(count: number, scale: number, sizeK = 1): Snow {
  const flakes = makeFlakes(count), n = flakes.length;
  const pos = new Float32Array(n * 3), alpha = new Float32Array(n), tmp = new Float32Array(4);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("aSize", new THREE.BufferAttribute(Float32Array.from(flakes, (f) => f.size), 1));
  g.setAttribute("aGlint", new THREE.BufferAttribute(Float32Array.from(flakes, (f) => (f.glitter ? 1 : 0)), 1));
  const m = new THREE.ShaderMaterial({
    name: "globe_snow", vertexShader: VERT, fragmentShader: SNOW_FRAG, ...INSIDE_GLASS,
    uniforms: { uPx: { value: 800 }, uScale: { value: scale }, uTime: { value: 0 }, uSizeK: { value: sizeK }, uColor: { value: new THREE.Color("#f6f8ff") } },
  });
  const points = new THREE.Points(g, m); points.name = "snow"; points.frustumCulled = false; points.renderOrder = 12;
  function update(t: number, energy: number, age: number) {
    for (let i = 0; i < n; i++) { flakeAt(flakes[i], t, energy, age, tmp); pos[i * 3] = tmp[0]; pos[i * 3 + 1] = tmp[1]; pos[i * 3 + 2] = tmp[2]; alpha[i] = tmp[3] * 0.92; }
    g.attributes.position.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; m.uniforms.uTime.value = t;
    m.uniforms.uSizeK.value = sizeK * (1 + 0.45 * energy); // flakes tumbling close to the glass in a storm look a little bigger
  }
  update(0, 0, 0);
  return { points, update, flakes, dispose() { g.dispose(); m.dispose(); } };
}

export type Smoke = { points: THREE.Points; update(t: number, strength: number): void; dispose(): void };

export function createSmoke(at: readonly [number, number, number], scale: number, count: number = SMOKE.count): Smoke {
  const pos = new Float32Array(count * 3), alpha = new Float32Array(count), size = new Float32Array(count), tmp = new Float32Array(5);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("aGlint", new THREE.BufferAttribute(new Float32Array(count), 1));
  const m = new THREE.ShaderMaterial({
    name: "globe_smoke", vertexShader: VERT, fragmentShader: SMOKE_FRAG, ...INSIDE_GLASS,
    uniforms: { uPx: { value: 800 }, uScale: { value: scale }, uTime: { value: 0 }, uSizeK: { value: 1 }, uColor: { value: new THREE.Color("#dcd6de") } },
  });
  const points = new THREE.Points(g, m); points.name = "smoke"; points.frustumCulled = false; points.renderOrder = 11;
  function update(t: number, strength: number) {
    for (let i = 0; i < count; i++) { smokeAt(i, count, t, at, tmp); pos[i * 3] = tmp[0]; pos[i * 3 + 1] = tmp[1]; pos[i * 3 + 2] = tmp[2]; alpha[i] = tmp[3] * strength; size[i] = tmp[4]; }
    g.attributes.position.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
  }
  update(0, 1);
  return { points, update, dispose() { g.dispose(); m.dispose(); } };
}

/** Keeps point sizes right for the current drawing-buffer height and camera (call when either changes). */
export function setPointScale(materials: THREE.ShaderMaterial[], bufferHeight: number, camera: THREE.PerspectiveCamera) {
  const px = (bufferHeight * camera.projectionMatrix.elements[5]) / 2;
  for (const m of materials) m.uniforms.uPx.value = px;
}
