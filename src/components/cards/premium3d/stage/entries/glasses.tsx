"use client";

import { NewYearCelebrationScene } from "../../../scenes/NewYearCelebrationScene";
import { withEnding } from "../LegacyEnding";
import { makeStage } from "../Stage";

/** 3D scene, with the existing CSS scene (plus the Mawica ending) as its fallback. */
export default makeStage("new-year-celebration", withEnding(NewYearCelebrationScene));
