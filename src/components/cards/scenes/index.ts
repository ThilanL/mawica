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
  "snow-globe": dynamic(() => import("./SnowGlobeScene").then((m) => m.SnowGlobeScene)),
  "christmas-tree": dynamic(() => import("./ChristmasTreeScene").then((m) => m.ChristmasTreeScene)),
  "special-gift": dynamic(() => import("./SpecialGiftScene").then((m) => m.SpecialGiftScene)),
  "warm-wishes": dynamic(() => import("./WarmWishesScene").then((m) => m.WarmWishesScene)),
  "new-year-2027": dynamic(() => import("./NewYear2027Scene").then((m) => m.NewYear2027Scene)),
  "new-year-celebration": dynamic(() => import("./NewYearCelebrationScene").then((m) => m.NewYearCelebrationScene)),
};

/** Premium scenes, separate from the six launch scenes (their map above is untouched). Also one lazy chunk per scene. */
export const premiumScenes: Record<PremiumTemplateKey, ComponentType<SceneProps>> = {
  "lumis-wish": dynamic(() => import("./LumisWishScene").then((m) => m.LumisWishScene)),
};

export const sceneFor = (key: AnyTemplateKey): ComponentType<SceneProps> => (isPremiumTemplateKey(key) ? premiumScenes[key] : scenes[key]);
