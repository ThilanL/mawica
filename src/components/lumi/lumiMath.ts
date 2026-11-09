/** Small pure helpers for the Lumi prototype (kept separate so they can be unit tested). */
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOut = (t: number) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

/** Total length of the celebration, in seconds. */
export const CELEBRATION_SECONDS = 2.6;

export type CelebrationPose = {
  /** extra Y rotation in radians (two full spins) */
  spin: number;
  /** vertical hop in world units (scaled by Lumi size) */
  hop: number;
  /** Y scale squash/stretch multiplier */
  squash: number;
  /** 0..1 open-mouth / happy-eyes weight */
  joy: number;
  /** 0..1 glow boost */
  glow: number;
};

/** Pure timeline: pose of the celebration at `t` seconds after the tap. */
export function celebrationPose(t: number): CelebrationPose {
  if (t < 0 || t >= CELEBRATION_SECONDS) return { spin: 0, hop: 0, squash: 1, joy: 0, glow: 0 };
  const spin = easeInOut(t / 1.1) * Math.PI * 4;
  const hopT = clamp((t - 0.1) / 0.9, 0, 1);
  const hop = Math.sin(hopT * Math.PI) * 0.3 + Math.sin(clamp((t - 1.3) / 0.6, 0, 1) * Math.PI) * 0.12;
  const anticipation = t < 0.12 ? 1 - 0.14 * Math.sin((t / 0.12) * Math.PI) : 1;
  const landing = t > 1.0 && t < 1.25 ? 1 - 0.08 * Math.sin(((t - 1.0) / 0.25) * Math.PI) : 1;
  const fadeIn = easeInOut(t / 0.25);
  const fadeOut = 1 - easeInOut((t - (CELEBRATION_SECONDS - 0.7)) / 0.7);
  const joy = clamp(Math.min(fadeIn, fadeOut), 0, 1);
  return { spin, hop, squash: anticipation * landing, joy, glow: joy };
}

/** Deterministic PRNG (mulberry32) so particle layouts are reproducible and render-pure. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normalised pointer offset (-1..1, y up) of a client point relative to an element's centre. */
export function pointerOffset(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }) {
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
  return { x: clamp(x, -1.4, 1.4), y: clamp(y, -1.4, 1.4) };
}

let webglProbe: boolean | undefined;

/**
 * WebGL availability probe (false during SSR). The answer is cached and the probe context is released at once:
 * browsers cap live WebGL contexts (about 16), and this is used as a render-time snapshot, so an uncached probe
 * would quietly consume contexts and cause the real canvas to lose its own.
 */
export function webglAvailable(): boolean {
  if (typeof document === "undefined") return false;
  if (webglProbe !== undefined) return webglProbe;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | WebGL2RenderingContext | null;
    webglProbe = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglProbe = false;
  }
  return webglProbe;
}
