import type { TemplateKey } from "@/modules/templates/registry";
import type { StageSceneModule } from "./types";

/** One lazy chunk per card: a page only downloads the model code of the card it shows. */
export const STAGE_LOADERS: Partial<Record<TemplateKey, () => Promise<StageSceneModule>>> = {
  "snow-globe": () => import("./cards/globe"),
  "christmas-tree": () => import("./cards/tree"),
  "special-gift": () => import("./cards/gift"),
  "warm-wishes": () => import("./cards/window"),
  "new-year-2027": () => import("./cards/newyear"),
  "new-year-celebration": () => import("./cards/glasses"),
};

/** Backdrop of each card: a vertical gradient with one soft glow. One definition feeds both the CSS (before any JavaScript) and the 3D scene's own background. */
export type Backdrop = { stops: [string, number][]; glow: { rgb: [number, number, number]; a: number; x: number; y: number; w: number; h: number } };
export const STAGE_BACKDROP: Record<string, Backdrop> = {
  "snow-globe": { stops: [["#2c1736", 0], ["#3a1a35", 55], ["#160b18", 100]], glow: { rgb: [255, 168, 104], a: 0.24, x: 50, y: 46, w: 62, h: 52 } },
  "christmas-tree": { stops: [["#14282c", 0], ["#101a24", 60], ["#0b1119", 100]], glow: { rgb: [47, 122, 99], a: 0.28, x: 50, y: 38, w: 70, h: 55 } },
  "special-gift": { stops: [["#4a2050", 0], ["#2a1b3d", 60], ["#170f24", 100]], glow: { rgb: [244, 195, 113], a: 0.22, x: 50, y: 42, w: 60, h: 50 } },
  "warm-wishes": { stops: [["#2b1420", 0], ["#3a1c2b", 55], ["#4a2230", 100]], glow: { rgb: [255, 179, 107], a: 0.25, x: 50, y: 55, w: 60, h: 50 } },
  "new-year-2027": { stops: [["#2b1a45", 0], ["#160c26", 70], ["#0e0719", 100]], glow: { rgb: [244, 195, 113], a: 0.18, x: 50, y: 40, w: 60, h: 45 } },
  "new-year-celebration": { stops: [["#3a2150", 0], ["#241238", 65], ["#150a24", 100]], glow: { rgb: [244, 195, 113], a: 0.2, x: 50, y: 42, w: 60, h: 45 } },
};
const css = (b: Backdrop) => `radial-gradient(${b.glow.w}% ${b.glow.h}% at ${b.glow.x}% ${b.glow.y}%, rgb(${b.glow.rgb.join(" ")} / ${b.glow.a}), transparent 70%), linear-gradient(180deg,${b.stops.map(([c, p]) => `${c} ${p}%`).join(",")})`;

/** Cheap static backdrops (no three.js) so the page is never blank while the scene loads, and for the no-JavaScript render. */
export const STAGE_BG: Record<string, string> = Object.fromEntries(Object.entries(STAGE_BACKDROP).map(([k, b]) => [k, css(b)]));
