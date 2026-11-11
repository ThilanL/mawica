"use client";

import { SpecialGiftScene } from "../../../scenes/SpecialGiftScene";
import { withEnding } from "../LegacyEnding";
import { makeStage } from "../Stage";

/** 3D scene, with the existing CSS scene (plus the Mawica ending) as its fallback. */
export default makeStage("special-gift", withEnding(SpecialGiftScene));
