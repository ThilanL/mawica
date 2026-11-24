import type { ComponentType } from "react";
import type { Shared } from "../rig";
import type { Vec3 } from "../timeline";

/** What a standard card's 3D scene module provides. The shell (camera, light-weight loop, message sheet, ending, fallbacks) is shared. */
export type StageSceneDef = {
  /** Seconds of choreography before the recipient reads (the reading stage itself has no end time). */
  duration: number;
  /** Camera pose at time t. Pure, so thumbnails and tests can call it. */
  camera(t: number, aspect: number): { pos: Vec3; look: Vec3; fov?: number };
  /** Fraction of the viewport height the picture is lifted by while reading, so the message sheet never covers the subject. */
  lift(aspect: number): number;
  /** Moment used for the catalogue thumbnail render. */
  heroT: number;
  /** Optional big countdown text (DOM) at time t. */
  countdown?(t: number): string | null;
  /** Storm-like wind used by shared particle layers. */
  wind?(t: number): number;
  fog?: [string, number, number];
};

/** `text`: the card's own names, for scenes that show them in 3D (the snow globe's engraving). The message itself always stays DOM text. */
export type StageSceneProps = { shared: { current: Shared }; mobile: boolean; mode: "play" | "static"; text?: { recipient: string; sender: string } };
export type StageSceneModule = { def: StageSceneDef; Scene: ComponentType<StageSceneProps> };
