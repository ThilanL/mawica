import type * as THREE from "three";

/** Handles to the scene objects the choreography moves. Filled by callback refs; read and written only inside the frame loop. */
export type Rig = {
  envelope: THREE.Group | null;
  flap: THREE.Group | null;
  card: THREE.Group | null;
  cover: THREE.Group | null;
  glowSprite: THREE.Sprite | null;
  glowShaft: THREE.Mesh | null;
  glowLight: THREE.PointLight | null;
};
export const newRig = (): Rig => ({ envelope: null, flap: null, card: null, cover: null, glowSprite: null, glowShaft: null, glowLight: null });

/** State shared between the frame-loop pieces (no React state: nothing here may trigger a re-render). */
export type Shared = {
  /** seconds of choreography played so far */
  t: number;
  playing: boolean;
  wind: number;
  storm: number;
  /** pointer in -1..1 */
  px: number;
  py: number;
  lastInput: number;
  /** celebration trigger (performance.now()/1000 of the last tap on Lumi) */
  celebrateAt: number;
  lumi: number;
  /** snow globe: performance.now()/1000 of the last tap or shake (its snowstorm), whether the recipient turned sound on, motion access granted */
  stormAt?: number;
  sound?: boolean;
  motion?: boolean;
};
export const newShared = (): Shared => ({ t: 0, playing: true, wind: 1, storm: 1, px: 0, py: 0, lastInput: -100, celebrateAt: -100, lumi: 0 });
