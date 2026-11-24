/**
 * "Christmas Snow Globe": dimensions, layout and quality profiles, independent of React and of the renderer. The web card (globe.tsx) and the
 * AR model (Stage E) both build from here, so the globe exists once. Units are metres, Y up, origin at the centre of the underside of the base,
 * resting on Y = 0, front of the globe facing +Z (the Mawica logo side).
 *
 * Visual reference: the Christmas hero video and its poster (public/art/hero/videos/christmas-poster.webp).
 */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

/** Overall size: 220 mm tall, 180 mm glass, 170 mm base. */
export const GLOBE = {
  height: 0.22,
  /** outer radius of the glass and its wall thickness */
  radius: 0.09,
  wall: 0.004,
  /** centre of the glass sphere: its top is exactly at `height` */
  centerY: 0.13,
  baseRadius: 0.085,
  /** top of the base collar, where the glass disappears into it */
  collarY: 0.0585,
} as const;
export const INNER_R = GLOBE.radius - GLOBE.wall;

/** Polar angle (from the top) where the glass meets the collar: the glass sphere is cut just below it. */
export const GLASS_THETA = Math.acos((GLOBE.collarY - 0.0025 - GLOBE.centerY) / GLOBE.radius);

/** Radius of the inner glass surface at height y (0 outside the sphere). */
export const innerRadiusAt = (y: number) => { const d = y - GLOBE.centerY; return d * d >= INNER_R * INNER_R ? 0 : Math.sqrt(INNER_R * INNER_R - d * d); };

/**
 * Lathe profile of the base, [radius, y] from the centre of the underside out and up. Segments are tagged by material:
 * a gold foot bead, the red lacquer band (slightly convex, narrowing upwards), the gold upper rim and the lip the glass sits in.
 */
export const BASE_PROFILE: { mat: "gold" | "red"; pts: Vec2[] }[] = [
  { mat: "gold", pts: [[0, 0], [0.0805, 0], [0.0838, 0.0006], [0.085, 0.0024], [0.085, 0.0052], [0.0842, 0.0072], [0.0826, 0.0086], [0.0812, 0.0098]] },
  { mat: "red", pts: [[0.0812, 0.0098], [0.0808, 0.0115], [0.0806, 0.016], [0.0801, 0.022], [0.0793, 0.028], [0.0783, 0.034], [0.0771, 0.0398], [0.0758, 0.0448], [0.0752, 0.0462]] },
  { mat: "gold", pts: [[0.0752, 0.0462], [0.0764, 0.0468], [0.0776, 0.0482], [0.0779, 0.0502], [0.0772, 0.0522], [0.0756, 0.0536], [0.0734, 0.0546], [0.0702, 0.0556], [0.0652, 0.0567], [0.0596, 0.0577], [0.0548, 0.0585], [0.0536, 0.0592]] },
];
/** The red band, for decorations that sit on it: radius at height y (linear between profile points). */
export function bandRadiusAt(y: number) {
  const p = BASE_PROFILE[1].pts;
  for (let i = 1; i < p.length; i++) if (y <= p[i][1]) { const [r0, y0] = p[i - 1], [r1, y1] = p[i]; return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0); }
  return p[p.length - 1][0];
}
export const BAND = { y0: 0.0115, y1: 0.0445 } as const;

/** Snow ground inside the globe: a gentle mound, higher at the back. */
export const GROUND_Y = 0.074;
export function groundHeight(x: number, z: number) {
  const r = Math.hypot(x, z), back = Math.max(0, -z) / 0.06;
  const mound = 0.0055 * Math.exp(-(x * x + (z + 0.012) * (z + 0.012)) / 0.0016) + 0.0085 * back * back * Math.exp(-r * r / 0.005); // the ground rises behind the cottage: a hill for the pines, depth from the front
  const swell = 0.0012 * Math.sin(x * 140 + 1.3) * Math.sin(z * 120 + 0.4); // soft drifts
  const rim = 0.003 * Math.max(0, (r - 0.05) / 0.016) ** 2; // snow banks up against the glass
  return GROUND_Y + mound + swell + rim;
}

/** Snow-covered shrubs that soften the edges of the scene and frame the foreground: [x, z, radius]. */
export const BUSHES: (readonly [number, number, number])[] = [
  [-0.05, 0.03, 0.0055], [-0.056, 0.016, 0.0045], [0.012, 0.054, 0.004], [0.042, 0.042, 0.0045], [0.058, 0.03, 0.0038], [-0.03, 0.05, 0.004],
  [-0.004, -0.032, 0.005], [0.018, -0.042, 0.0045], [-0.046, -0.012, 0.004],
];

/** Path from the cottage door to the front, and the footprints along it (the ground shader lowers and marks it). */
export const PATH: Vec2[] = [[-0.012, -0.004], [-0.008, 0.012], [-0.002, 0.026], [0.006, 0.04], [0.012, 0.052]];

/**
 * Where everything stands (x, z on the ground; the y of each item is the ground height there), its turn about Y and its size.
 * `fit` is the bounding radius (m) used to check every item is wholly inside the glass.
 */
export type Placement = { id: string; at: Vec2; turn: number; height: number; fit: number };
export const LAYOUT: Placement[] = [
  { id: "cottage", at: [-0.014, -0.016], turn: 0.18, height: 0.047, fit: 0.036 },
  { id: "tree", at: [0.032, -0.016], turn: 0, height: 0.1, fit: 0.028 },
  { id: "pine-back-left", at: [-0.04, -0.034], turn: 1.1, height: 0.066, fit: 0.012 },
  { id: "pine-back", at: [0.004, -0.046], turn: 2.3, height: 0.07, fit: 0.012 },
  { id: "pine-back-right", at: [0.042, -0.029], turn: 0.4, height: 0.056, fit: 0.011 },
  { id: "pine-left", at: [-0.052, 0.002], turn: 3.0, height: 0.05, fit: 0.01 },
  { id: "pine-small-back", at: [-0.018, -0.05], turn: 0.7, height: 0.044, fit: 0.009 },
  { id: "pine-small-right", at: [0.054, -0.006], turn: 1.9, height: 0.038, fit: 0.008 },
  { id: "lantern", at: [0.052, 0.022], turn: -0.7, height: 0.068, fit: 0.006 },
  { id: "snowman", at: [-0.038, 0.026], turn: 0.3, height: 0.04, fit: 0.012 },
  { id: "reindeer", at: [0.03, 0.031], turn: -1.05, height: 0.036, fit: 0.017 },
  { id: "present-a", at: [-0.02, 0.04], turn: 0.3, height: 0.011, fit: 0.008 },
  { id: "present-b", at: [-0.002, 0.042], turn: -0.5, height: 0.009, fit: 0.007 },
  { id: "present-c", at: [0.006, 0.034], turn: 0.9, height: 0.0072, fit: 0.006 },
];
export const placement = (id: string) => { const p = LAYOUT.find((l) => l.id === id); if (!p) throw new Error(`no placement ${id}`); return p; };

/** Largest distance from the glass centre reached by an item (its footprint circle at the ground and its top). Must stay inside INNER_R. */
export function reach(p: Placement) {
  const [x, z] = p.at, y0 = groundHeight(x, z), cy = GLOBE.centerY, r = Math.hypot(x, z);
  const corner = (yy: number, rr: number) => Math.hypot(rr, yy - cy);
  return Math.max(corner(y0, r + p.fit), corner(y0 + p.height, r + p.fit * 0.35));
}

/** Quality profiles: the web card picks desktop or mobile; AR uses "ar" (lighter models and segments, 256 px generated textures, `-ar` asset files). */
export const PROFILES = {
  desktop: { glass: "transmission", sphere: [96, 64], lathe: 128, tree: { levels: 26, perLevel: 15 }, pine: { levels: 15, perLevel: 9 }, lights: 110, ornaments: 34, shadows: 1024, flakes: true, filigree: true, tex: 1024, lod: 1, assetSuffix: "" },
  mobile: { glass: "fresnel", sphere: [64, 40], lathe: 96, tree: { levels: 18, perLevel: 11 }, pine: { levels: 11, perLevel: 7 }, lights: 70, ornaments: 26, shadows: 0, flakes: true, filigree: true, tex: 512, lod: 1, assetSuffix: "" },
  ar: { glass: "opacity", sphere: [36, 22], lathe: 56, tree: { levels: 10, perLevel: 6 }, pine: { levels: 7, perLevel: 4 }, lights: 30, ornaments: 16, shadows: 0, flakes: false, filigree: false, tex: 256, lod: 0.5, assetSuffix: "-ar" },
} as const;
export type ProfileName = keyof typeof PROFILES;
export type Profile = (typeof PROFILES)[ProfileName];

/** Brand palette of the globe (sampled from the hero poster). */
export const COLORS = {
  lacquer: "#7d0a10",
  gold: "#e6b04f",
  snow: "#f4f6fb",
  wood: "#6b4428",
  ornamentRed: "#b3121b",
  ornamentGold: "#e9b84f",
  scarf: "#b3141c",
  window: "#ffb456",
} as const;

/** Scene scale for the website: the Stage cameras and fog work in units of about a metre, so the 22 cm globe is drawn 25 times larger. */
export const WEB_SCALE = 25;
