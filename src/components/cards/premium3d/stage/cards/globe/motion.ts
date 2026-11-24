import { rng } from "../../gfx";
import { GLOBE, INNER_R, groundHeight, innerRadiusAt } from "../globe-model";

/**
 * Snow globe animation as pure functions of time (no React, no renderer), so the card, thumbnails, seeking and tests all see the same thing.
 * Everything here is in the model's own space (metres, origin at the base). Positions are computed on the CPU each frame (a few hundred
 * particles), which keeps one source of truth that tests can check: no flake or smoke puff ever leaves the inner glass.
 */

const TAU = Math.PI * 2;
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (a: number, b: number, x: number) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };

/** Length of the intro choreography (s); the reading stage follows. */
export const GLOBE_DURATION = 11;

/** Intro timeline (seconds of choreography): the village lights come on one after another, then the star, then a first gentle flurry. */
export const INTRO = { windows: [1.2, 2.4], lantern: [2.0, 2.8], tree: [2.6, 5.0], star: [5.0, 6.4], storm: 6.2 } as const;
export const windowsOn = (t: number) => smooth(INTRO.windows[0], INTRO.windows[1], t);
export const lanternOn = (t: number) => { const k = smooth(INTRO.lantern[0], INTRO.lantern[1], t); return k < 1 ? k * (0.75 + 0.25 * Math.sin(t * 47) * Math.sin(t * 31)) : 1; }; // a little stutter as it lights
/** Garland light i of n turns on in a chase from the bottom of the tree to the top. */
export const treeLightOn = (t: number, i: number, n: number) => { const at = INTRO.tree[0] + (i / n) * (INTRO.tree[1] - INTRO.tree[0]); return smooth(at, at + 0.35, t); };
export const starOn = (t: number) => smooth(INTRO.star[0], INTRO.star[1], t);

/** Slow, small, never-repeating-looking variation (sum of incommensurate sines), in -1..1. */
export const wobble = (t: number, seed: number) => (Math.sin(t * 1.7 + seed) * 0.5 + Math.sin(t * 2.9 + seed * 2.3) * 0.3 + Math.sin(t * 6.1 + seed * 0.7) * 0.2);
/** Warm light flicker: ±5% around 1 (cottage windows, lantern). */
export const flicker = (t: number, seed: number) => 1 + 0.05 * wobble(t, seed);
/** Twinkle of garland light i: each breathes at its own rate between 55% and 100%. */
export const twinkle = (t: number, i: number) => 0.775 + 0.225 * Math.sin(t * (1.4 + (i % 7) * 0.31) + i * 2.17);
/** The star's gentle golden breathing: 85%–100%. */
export const starGlow = (t: number) => 0.925 + 0.075 * Math.sin(t * 1.25);

/**
 * Snowstorm energy `age` seconds after a shake: a quick swirl-up (0.4 s), then it settles over about ten seconds. 0 before the shake.
 * The swirl is a blend between each flake's calm fall and its place in a vortex, so energy 0 is exactly the calm snowfall.
 */
export function stormEnergy(age: number) {
  if (!(age >= 0)) return 0;
  if (age < 0.4) return smooth(0, 0.4, age);
  const e = Math.exp(-(age - 0.4) / 2.6);
  return e < 0.004 ? 0 : e;
}
/** Seconds after which a storm has fully settled. */
export const STORM_SETTLE = 15;

export type Flake = {
  /** calm fall: column position (radius, angle), sway radius, top and rest heights, speed (m/s), phase 0..1, sway rate */
  r: number; a: number; sway: number; top: number; rest: number; speed: number; phase: number; w: number;
  /** vortex: a point inside the glass (radius, angle, height), spin rate, bob */
  vr: number; va: number; vy: number; spin: number; bob: number;
  size: number; glitter: boolean;
};

const SAFE = INNER_R - 0.0035; // flakes keep 3.5 mm from the glass (their own radius is under 1 mm)

/** Deterministic flakes (seeded): every render and every test sees the same snow. */
export function makeFlakes(count: number, seed = 2026): Flake[] {
  const rnd = rng(seed), out: Flake[] = [];
  while (out.length < count) {
    const sway = 0.0015 + rnd() * 0.003, r = Math.sqrt(rnd()) * 0.066, a = rnd() * TAU;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, rest = groundHeight(x, z) + 0.0008;
    if (r + sway > innerRadiusAt(rest) - 0.0035) continue; // the whole column must fit, from the snow up
    const top = GLOBE.centerY + Math.sqrt(SAFE * SAFE - (r + sway) * (r + sway));
    if (top - rest < 0.02) continue;
    // vortex point: inside a smaller sphere, above the scenery
    let vr = 0, vy = 0;
    for (let k = 0; k < 20; k++) { const px = (rnd() * 2 - 1) * 0.07, py = (rnd() * 2 - 1) * 0.07, pz = (rnd() * 2 - 1) * 0.07; if (px * px + py * py + pz * pz < 0.066 * 0.066 && GLOBE.centerY + py > 0.096) { vr = Math.hypot(px, pz); vy = GLOBE.centerY + py; break; } }
    if (!vy) continue;
    out.push({ r, a, sway, top, rest, speed: 0.0055 + rnd() * 0.0055, phase: rnd(), w: 0.5 + rnd() * 0.9, vr, va: rnd() * TAU, vy, spin: (0.9 + rnd() * 1.4) * (rnd() < 0.85 ? 1 : -1), bob: 0.002 + rnd() * 0.003, size: 0.0006 + rnd() * 0.0008, glitter: rnd() < 0.12 });
  }
  return out;
}

/**
 * Position of flake `f` at time `t` with storm energy `e` (from stormEnergy) and storm age `age` (for the swirl angle). Writes into `out`
 * [x, y, z, alpha]. Calm: falls down its column, swaying, fades in at the top and settles into the snow at the bottom, then begins again.
 */
export function flakeAt(f: Flake, t: number, e: number, age: number, out: Float32Array | number[], o = 0) {
  const H = f.top - f.rest, u = (f.phase + (t * f.speed) / H) % 1;
  const y0 = f.top - u * H, sa = t * f.w + f.phase * TAU;
  const x0 = Math.cos(f.a) * f.r + Math.cos(sa) * f.sway, z0 = Math.sin(f.a) * f.r + Math.sin(sa) * f.sway;
  let x = x0, y = y0, z = z0, alpha = smooth(0, 0.06, u) * (1 - smooth(0.965, 1, u));
  if (e > 0) {
    const ang = f.va + f.spin * 2.6 * (1 - Math.exp(-Math.max(0, age) / 2.6)) * 3.2; // spins fast, slows as it settles
    const bob = Math.sin(age * 2.1 + f.phase * TAU) * f.bob;
    const vx = Math.cos(ang) * f.vr, vz = Math.sin(ang) * f.vr, vy = f.vy + bob;
    x = x0 + (vx - x0) * e; y = y0 + (vy - y0) * e; z = z0 + (vz - z0) * e;
    alpha = alpha + (1 - alpha) * e; // in the storm every flake is visible
  }
  out[o] = x; out[o + 1] = y; out[o + 2] = z; out[o + 3] = alpha;
}

/** Chimney smoke: soft puffs rising from `at` (model space), drifting and spreading, fading as they go. */
export const SMOKE = { count: 30, life: 4.2, rise: 0.034, drift: 0.012 } as const;
export function smokeAt(i: number, n: number, t: number, at: readonly [number, number, number], out: Float32Array | number[], o = 0) {
  const u = ((t / SMOKE.life) + i / n) % 1, seed = i * 1.618;
  const curl = Math.sin(u * 5 + seed) * 0.003 * u;
  let x = at[0] + SMOKE.drift * u * u + curl, y = at[1] + SMOKE.rise * Math.pow(u, 0.85), z = at[2] + Math.cos(u * 4 + seed) * 0.0025 * u - 0.004 * u * u;
  // never outside the glass
  const dx = x, dy = y - GLOBE.centerY, dz = z, d = Math.hypot(dx, dy, dz), lim = INNER_R - 0.006;
  if (d > lim) { const k = lim / d; x = dx * k; y = GLOBE.centerY + dy * k; z = dz * k; }
  out[o] = x; out[o + 1] = y; out[o + 2] = z;
  out[o + 3] = smooth(0, 0.12, u) * (1 - smooth(0.4, 1, u)) * 0.2; // alpha: soft and see-through
  out[o + 4] = 0.004 + 0.018 * u; // size (m): puffs widen as they rise
}
