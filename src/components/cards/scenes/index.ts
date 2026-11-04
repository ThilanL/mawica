import type { ComponentType } from "react";
import type { TemplateKey } from "@/modules/templates/registry";
import type { SceneProps } from "../types";
import { SnowGlobeScene } from "./SnowGlobeScene";
import { ChristmasTreeScene } from "./ChristmasTreeScene";
import { SpecialGiftScene } from "./SpecialGiftScene";
import { WarmWishesScene } from "./WarmWishesScene";
import { NewYear2027Scene } from "./NewYear2027Scene";
import { NewYearCelebrationScene } from "./NewYearCelebrationScene";

/** Register one scene per template key. */
export const scenes: Record<TemplateKey, ComponentType<SceneProps>> = {
  "snow-globe": SnowGlobeScene,
  "christmas-tree": ChristmasTreeScene,
  "special-gift": SpecialGiftScene,
  "warm-wishes": WarmWishesScene,
  "new-year-2027": NewYear2027Scene,
  "new-year-celebration": NewYearCelebrationScene,
};
