"use client";

import { SnowGlobeScene } from "../../../scenes/SnowGlobeScene";
import { withEnding } from "../LegacyEnding";

/** The snow globe keeps its premium pre-rendered artwork (see docs/catalogue-3d.md); it gains the shared Mawica ending. */
export default withEnding(SnowGlobeScene);
