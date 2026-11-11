import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { isPremiumTemplateKey, type AnyTemplateKey, type PremiumTemplateKey, type TemplateKey } from "@/modules/templates/registry";
import type { SceneProps } from "../types";

/**
 * One scene per template key. Each scene is a separate chunk, so a page only downloads the scene it shows
 * (the recipient page still server-renders it, so the greeting is in the first HTML).
 * Tests import the scene files directly (tests/regression.test.tsx).
 */
export const scenes: Record<TemplateKey, ComponentType<SceneProps>> = {
  "snow-globe": dynamic(() => import("../premium3d/stage/entries/globe").then((m) => m.default)), // existing premium artwork + the shared Mawica ending
  "christmas-tree": dynamic(() => import("../premium3d/stage/entries/tree").then((m) => m.default)), // 3D (WebGL), with the CSS scene as its fallback
  "special-gift": dynamic(() => import("../premium3d/stage/entries/gift").then((m) => m.default)),
  "warm-wishes": dynamic(() => import("../premium3d/stage/entries/window").then((m) => m.default)),
  "new-year-2027": dynamic(() => import("../premium3d/stage/entries/newyear").then((m) => m.default)),
  "new-year-celebration": dynamic(() => import("../premium3d/stage/entries/glasses").then((m) => m.default)),
};

/** Premium scenes, separate from the six launch scenes (their map above is untouched). Also one lazy chunk per scene. */
export const premiumScenes: Record<PremiumTemplateKey, ComponentType<SceneProps>> = {
  "lumis-wish": dynamic(() => import("./LumisWishScene").then((m) => m.LumisWishScene)),
  // 3D cinematic version: its own lazy chunk; three.js / react-three-fiber load only inside it (never on the homepage).
  "lumis-wish-cinema": dynamic(() => import("../premium3d/CinematicScene").then((m) => m.CinematicScene)),
};

export const sceneFor = (key: AnyTemplateKey): ComponentType<SceneProps> => (isPremiumTemplateKey(key) ? premiumScenes[key] : scenes[key]);
