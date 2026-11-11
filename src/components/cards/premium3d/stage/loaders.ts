import type { TemplateKey } from "@/modules/templates/registry";
import type { StageSceneModule } from "./types";

/** One lazy chunk per card: a page only downloads the model code of the card it shows. */
export const STAGE_LOADERS: Partial<Record<TemplateKey, () => Promise<StageSceneModule>>> = {
  "christmas-tree": () => import("./cards/tree"),
  "special-gift": () => import("./cards/gift"),
  "warm-wishes": () => import("./cards/window"),
  "new-year-2027": () => import("./cards/newyear"),
  "new-year-celebration": () => import("./cards/glasses"),
};

/** Cheap static backdrops (no three.js) so the page is never blank while the scene loads, and for the no-JavaScript render. */
export const STAGE_BG: Record<string, string> = {
  "christmas-tree": "radial-gradient(70% 55% at 50% 38%, rgb(47 122 99 / 0.28), transparent 70%), linear-gradient(180deg,#14282c 0%,#101a24 60%,#0b1119 100%)",
  "special-gift": "radial-gradient(60% 50% at 50% 42%, rgb(244 195 113 / 0.22), transparent 70%), linear-gradient(180deg,#4a2050 0%,#2a1b3d 60%,#170f24 100%)",
  "warm-wishes": "radial-gradient(60% 50% at 50% 55%, rgb(255 179 107 / 0.25), transparent 70%), linear-gradient(180deg,#2b1420 0%,#3a1c2b 55%,#4a2230 100%)",
  "new-year-2027": "radial-gradient(60% 45% at 50% 40%, rgb(244 195 113 / 0.18), transparent 70%), linear-gradient(180deg,#2b1a45 0%,#160c26 70%,#0e0719 100%)",
  "new-year-celebration": "radial-gradient(60% 45% at 50% 42%, rgb(244 195 113 / 0.2), transparent 70%), linear-gradient(180deg,#3a2150 0%,#241238 65%,#150a24 100%)",
};
