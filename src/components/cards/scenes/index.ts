import type { ComponentType } from "react";
import type { TemplateKey } from "@/modules/templates/registry";
import type { SceneProps } from "../types";
import { SnowGlobeScene } from "./SnowGlobeScene";

/** Register one scene per template key. */
export const scenes: Record<TemplateKey, ComponentType<SceneProps>> = {
  "snow-globe": SnowGlobeScene,
};
