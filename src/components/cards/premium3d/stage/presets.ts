import type { AmbientPreset } from "../ambient";

/** Gentle snowfall for interiors and the tree (the cinematic card's storm is much stronger). */
export const SNOWFALL: AmbientPreset = {
  id: "snowfall", mobileScale: 0.55,
  layers: [
    { id: "far", count: 360, size: 0.1, speed: 0.45, sway: 0.4, color: [0.9, 0.88, 1], opacity: 0.6, box: { sx: 24, sy: 12, near: 8, far: 34 }, windInfluence: 0.6 },
    { id: "mid", count: 200, size: 0.1, speed: 0.65, sway: 0.5, color: [1, 0.97, 1], opacity: 0.85, box: { sx: 10, sy: 7, near: 3, far: 16 }, windInfluence: 0.5 },
    { id: "near", count: 40, size: 0.26, speed: 0.9, sway: 0.7, color: [1, 0.94, 0.98], opacity: 0.28, box: { sx: 5, sy: 4, near: 1.2, far: 5 }, windInfluence: 0.4 },
  ],
};

export const GOLD_DUST: AmbientPreset = {
  id: "gold-dust", mobileScale: 0.5,
  layers: [
    { id: "gold", count: 160, size: 0.085, speed: -0.08, sway: 0.4, color: [1, 0.78, 0.42], opacity: 1, glow: true, twinkle: 1, box: { sx: 12, sy: 7, near: 2, far: 24 }, windInfluence: 0.2 },
    { id: "rose", count: 40, size: 0.1, speed: -0.05, sway: 0.5, color: [0.85, 0.55, 0.85], opacity: 0.7, glow: true, twinkle: 1, box: { sx: 8, sy: 5, near: 2, far: 16 }, windInfluence: 0.2 },
  ],
};
