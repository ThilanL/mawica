"use client";

import { NewYear2027Scene } from "../../../scenes/NewYear2027Scene";
import { withEnding } from "../LegacyEnding";
import { makeStage } from "../Stage";

/** 3D scene, with the existing CSS scene (plus the Mawica ending) as its fallback. */
export default makeStage("new-year-2027", withEnding(NewYear2027Scene));
