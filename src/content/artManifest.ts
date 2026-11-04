/**
 * Batch 1 asset intake manifest (single source of truth for filenames, sizes, alpha and weight).
 * Plan: docs/visual-upgrade-plan.md. Checklist: docs/batch1-intake.md. Validate with `npm run art:check`.
 * Nothing here wires artwork into the UI: that happens only after the files are approved.
 */
export type ArtAsset = {
  id: string;
  /** Path under /public (served at the same path minus "public") */
  file: string;
  width: number;
  height: number;
  alpha: boolean;
  /** Maximum file weight in KB */
  maxKB: number;
  /** Stacking order within its section, 0 = furthest back */
  layer: number;
  /** Viewport the file is for */
  viewport: "all" | "desktop" | "mobile";
};

export const batch1: ArtAsset[] = [
  { id: "H1", file: "public/art/hero/globe@2x.webp", width: 2400, height: 2720, alpha: true, maxKB: 320, layer: 2, viewport: "all" },
  { id: "H2", file: "public/art/hero/plate-desktop@2x.webp", width: 2880, height: 1240, alpha: false, maxKB: 220, layer: 0, viewport: "desktop" },
  { id: "H3", file: "public/art/hero/plate-mobile@2x.webp", width: 1170, height: 1000, alpha: false, maxKB: 120, layer: 0, viewport: "mobile" },
  { id: "H4", file: "public/art/hero/foreground-ornaments@2x.webp", width: 1400, height: 700, alpha: true, maxKB: 120, layer: 4, viewport: "desktop" },
  { id: "T1", file: "public/art/cards/thumb-snow-globe@2x.webp", width: 960, height: 720, alpha: false, maxKB: 70, layer: 0, viewport: "all" },
  { id: "T2", file: "public/art/cards/thumb-christmas-tree@2x.webp", width: 960, height: 720, alpha: false, maxKB: 70, layer: 0, viewport: "all" },
  { id: "T3", file: "public/art/cards/thumb-special-gift@2x.webp", width: 960, height: 720, alpha: false, maxKB: 70, layer: 0, viewport: "all" },
  { id: "T4", file: "public/art/cards/thumb-warm-wishes@2x.webp", width: 960, height: 720, alpha: false, maxKB: 70, layer: 0, viewport: "all" },
  { id: "T5", file: "public/art/cards/thumb-new-year-2027@2x.webp", width: 960, height: 720, alpha: false, maxKB: 70, layer: 0, viewport: "all" },
  { id: "T6", file: "public/art/cards/thumb-new-year-celebration@2x.webp", width: 960, height: 720, alpha: false, maxKB: 70, layer: 0, viewport: "all" },
];

/** Hero stacking, back to front (code layers are not images). */
export const heroLayerOrder = [
  "0  plate (H2 desktop / H3 mobile), opaque, gentle zoom",
  "1  gradient fallback sits behind the plate so the hero is never blank",
  "2  globe (H1), transparent, float + parallax",
  "3  code: snow clipped to glass, twinkling lights, halo",
  "4  ornaments (H4), transparent, desktop only, opposite parallax",
  "5  live text and CTA (DOM, never baked into art)",
] as const;
