/**
 * Ambient particle environments. The cinematic card defaults to "winter" (a storm of snow with golden dust); other occasions can
 * add a preset here and pick it by id, without touching the scene. Counts are for desktop; phones get mobileScale of them.
 */
export type AmbientLayer = {
  id: string;
  count: number;
  /** world size of one particle */
  size: number;
  /** fall speed (units/s); negative rises */
  speed: number;
  /** sideways drift amplitude */
  sway: number;
  color: [number, number, number];
  opacity: number;
  /** glowing (additive) instead of soft opaque snow */
  glow?: boolean;
  twinkle?: number;
  /** box around the camera: half width, half height, nearest and farthest distance in front of it */
  box: { sx: number; sy: number; near: number; far: number };
  /** how much the storm (wind) pushes this layer */
  windInfluence: number;
};

export type AmbientPreset = { id: string; mobileScale: number; layers: AmbientLayer[] };

export const AMBIENT: Record<string, AmbientPreset> = {
  winter: {
    id: "winter",
    mobileScale: 0.55,
    layers: [
      { id: "far-snow", count: 700, size: 0.11, speed: 0.6, sway: 0.5, color: [0.88, 0.85, 1], opacity: 0.65, box: { sx: 30, sy: 16, near: 12, far: 46 }, windInfluence: 1.4 },
      { id: "mid-snow", count: 420, size: 0.12, speed: 0.85, sway: 0.7, color: [1, 0.96, 1], opacity: 0.9, box: { sx: 12, sy: 8, near: 4, far: 22 }, windInfluence: 1.1 },
      { id: "near-snow", count: 110, size: 0.3, speed: 1.2, sway: 0.9, color: [1, 0.93, 0.98], opacity: 0.38, box: { sx: 5, sy: 4.5, near: 1.4, far: 6 }, windInfluence: 0.8 },
      { id: "gold-dust", count: 190, size: 0.09, speed: -0.07, sway: 0.4, color: [1, 0.78, 0.42], opacity: 1, glow: true, twinkle: 1, box: { sx: 12, sy: 7, near: 2, far: 24 }, windInfluence: 0.5 },
      { id: "rose-lavender", count: 40, size: 0.09, speed: -0.04, sway: 0.5, color: [0.82, 0.55, 0.85], opacity: 0.7, glow: true, twinkle: 1, box: { sx: 8, sy: 5, near: 2, far: 16 }, windInfluence: 0.4 },
    ],
  },
  // Example of a second occasion: no snow, only drifting golden light.
  stardust: {
    id: "stardust",
    mobileScale: 0.5,
    layers: [
      { id: "gold-dust", count: 260, size: 0.08, speed: -0.09, sway: 0.5, color: [1, 0.8, 0.45], opacity: 0.9, glow: true, twinkle: 1, box: { sx: 14, sy: 8, near: 2, far: 30 }, windInfluence: 0.3 },
      { id: "rose-lavender", count: 90, size: 0.1, speed: -0.05, sway: 0.6, color: [0.85, 0.55, 0.85], opacity: 0.7, glow: true, twinkle: 1, box: { sx: 10, sy: 6, near: 2, far: 20 }, windInfluence: 0.3 },
    ],
  },
};

export const DEFAULT_AMBIENT = "winter";
export const presetById = (id?: string) => AMBIENT[id ?? DEFAULT_AMBIENT] ?? AMBIENT[DEFAULT_AMBIENT];
export const layerCount = (l: AmbientLayer, mobile: boolean, p: AmbientPreset) => Math.max(8, Math.round(l.count * (mobile ? p.mobileScale : 1)));
export const totalParticles = (p: AmbientPreset, mobile: boolean) => p.layers.reduce((n, l) => n + layerCount(l, mobile, p), 0);
