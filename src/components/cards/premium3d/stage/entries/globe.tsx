"use client";

import { SnowGlobeScene } from "../../../scenes/SnowGlobeScene";
import { withEnding } from "../LegacyEnding";
import { makeStage } from "../Stage";

/** Genuine 3D snow globe (WebGL), with the existing 2D artwork scene (plus the Mawica ending) as its fallback. */
export default makeStage("snow-globe", withEnding(SnowGlobeScene));
