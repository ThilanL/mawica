import type { TemplateKey } from "@/modules/templates/registry";
import type { HeroLight } from "./hero";

/**
 * Production artwork slots for the six card scenes (the homepage hero has its own config in hero.ts).
 *
 * Every scene renders from three optional image layers plus code-driven effect layers:
 *   backdrop   full-bleed background (9:16 WebP, opaque)           -> behind everything
 *   main       transparent subject (PNG/WebP), sized by the stage   -> replaces the temporary SVG
 *   foreground transparent overlay (vignette, bokeh, framing)      -> above the subject, never intercepts taps
 *   lights     positions (percent of `main`) where glow/sparkle effects are painted by code
 * While a layer is missing, the built-in temporary SVG/gradient renders instead and `status` stays
 * "placeholder". Only flip `status` to "production" when final, approved artwork has been supplied.
 * Specs: docs/visual-assets.md
 */
export type ArtLayerSpec = { src: string; width: number; height: number };

export type SceneArtwork = {
  status: "placeholder" | "production";
  backdrop?: ArtLayerSpec;
  main?: ArtLayerSpec & { alt: string };
  foreground?: ArtLayerSpec;
  lights?: HeroLight[];
};

export const sceneArtwork: Record<TemplateKey, SceneArtwork> = {
  "snow-globe": { status: "placeholder" },
  "christmas-tree": { status: "placeholder" },
  "special-gift": { status: "placeholder" },
  "warm-wishes": { status: "placeholder" },
  "new-year-2027": { status: "placeholder" },
  "new-year-celebration": { status: "placeholder" },
};

export const hasTemporaryArtwork = (k: TemplateKey) => sceneArtwork[k].status !== "production";
