"use client";

import { ChristmasTreeScene } from "../../../scenes/ChristmasTreeScene";
import { withEnding } from "../LegacyEnding";
import { makeStage } from "../Stage";

/** 3D scene, with the existing CSS scene (plus the Mawica ending) as its fallback. */
export default makeStage("christmas-tree", withEnding(ChristmasTreeScene));
