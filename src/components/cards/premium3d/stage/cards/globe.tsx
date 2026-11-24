"use client";

import { easeInOutSine, fitDistance, lerp, seg } from "../../timeline";
import type { StageSceneDef, StageSceneModule, StageSceneProps } from "../types";
import { useMemo } from "react";
import { GLOBE, WEB_SCALE } from "./globe-model";
import { engravingLines } from "./globe/engraving";
import { GlobeWorld } from "./globe/GlobeWorld";
import { GLOBE_DURATION } from "./globe/motion";

/**
 * "Christmas Snow Globe": a genuine 3D globe. The intro opens on the recipient's names engraved on the back of the base, then sweeps round to
 * the front as the village lights come on and a first flurry swirls up; then snow keeps falling, and a tap or a shake whips up a snowstorm.
 */
export const DURATION = GLOBE_DURATION;
const CENTER_Y = GLOBE.centerY * WEB_SCALE * 0.86; // look slightly below the glass centre so the base sits in frame

const ENGRAVING_Y = 0.034 * WEB_SCALE; // just above the plate on the back of the base, so the bottom of the glass shows too

/**
 * Intro camera: it opens close on the back of the base, where the recipient's names are engraved, holds there long enough to read them, then
 * sweeps round the globe (rising and pulling back) to settle on the front hero view as the village lights come on.
 */
export const def: StageSceneDef = {
  duration: DURATION, heroT: 10.5,
  lift: (a) => (a < 0.9 ? 0.2 : 0.21),
  fog: ["#1c0f1e", 30, 90],
  camera(t, aspect) {
    const k = easeInOutSine(seg(t, 1.7, DURATION - 0.8)); // 0: reading the engraving, 1: hero view
    // wide screens: as the intro ends the camera eases back a little, so the whole globe, base and logo included, sits above the message sheet
    const margin = aspect < 0.9 ? 1.25 : lerp(1.12, 1.42, easeInOutSine(seg(t, DURATION - 1.6, DURATION)));
    const far = fitDistance(GLOBE.radius * 2.25 * WEB_SCALE, GLOBE.height * 1.18 * WEB_SCALE, aspect, margin);
    const near = Math.max(4.6, fitDistance(0.13 * WEB_SCALE, 0.085 * WEB_SCALE, aspect, 1.1)); // the back of the base, with the plate in the middle
    const dist = lerp(near, far, easeInOutSine(seg(t, 2.2, DURATION - 0.6)));
    const a = lerp(Math.PI, -0.12, k) + Math.sin(t * 0.21) * 0.025 * k; // from square-on to the plate, round the globe to just off the front
    const el = lerp(0.06, 0.2, k);
    const lookY = lerp(ENGRAVING_Y, CENTER_Y, easeInOutSine(seg(t, 2.0, DURATION - 0.8)));
    return { pos: { x: Math.sin(a) * Math.cos(el) * dist, y: lookY + Math.sin(el) * dist, z: Math.cos(a) * Math.cos(el) * dist }, look: { x: 0, y: lookY, z: 0 }, fov: 34 };
  },
};

function Globe({ mobile, shared, mode, text }: StageSceneProps) {
  const engraving = useMemo(() => engravingLines(text?.recipient ?? "", text?.sender ?? ""), [text?.recipient, text?.sender]);
  return <GlobeWorld profile={mobile ? "mobile" : "desktop"} shared={shared} mode={mode} engraving={engraving} />;
}

const mod: StageSceneModule = { def, Scene: Globe };
export default mod;
export const Scene = Globe;
