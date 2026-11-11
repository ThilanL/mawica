/**
 * Choreography of the cinematic card. Pure maths, no Three.js: poseAt(t, aspect) returns where everything is at time t
 * (seconds). The canvas applies it imperatively every frame; tests call it directly. Keeping it pure also means the
 * animation can be paused, skipped or seeked without any accumulated state.
 *
 * Units are scene units (an envelope is 3.2 wide). The card is a TOP-FOLD card: the cover hinges on the page's top edge and
 * flips forward and up, so the opened card is tall. That layout suits phones in portrait, where a side-opening spread would be tiny.
 */
export const DIM = {
  envW: 3.3, envH: 2.55, envD: 0.1,
  cardW: 2.5, cardH: 2.05, cardD: 0.02,
} as const;

export const FOV = 38;

export const T = {
  arriveEnd: 6.4, settleEnd: 7.6,
  flapStart: 7.6, flapEnd: 9.1,
  glowStart: 8.2, glowEnd: 10.2,
  slideStart: 9.1, slideEnd: 10.9,
  turnStart: 10.9, turnEnd: 12.6,
  openStart: 12.6, openEnd: 14.2,
  lumiStart: 13.8, lumiEnd: 15.0,
  end: 15.2,
} as const;

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
export const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
export const easeInOutSine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;
export const easeOutBack = (x: number, s = 1.4) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2;

export type Vec3 = { x: number; y: number; z: number };

/** Rotates a vector by an Euler XYZ rotation (Three.js order), so the card can ride inside the envelope while it tumbles. */
export function rotateXYZ(v: Vec3, rx: number, ry: number, rz: number): Vec3 {
  let { x, y, z } = v;
  let c = Math.cos(rz), s = Math.sin(rz); [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(ry); s = Math.sin(ry); [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(rx); s = Math.sin(rx); [y, z] = [y * c - z * s, y * s + z * c];
  return { x, y, z };
}
export type Pose = {
  envelope: Vec3 & { rx: number; ry: number; rz: number };
  /** Flap rotation about the envelope's top edge: 0 closed .. ~2.95 rad open. */
  flap: number;
  /** 0..1 strength of the golden light from the opening. */
  glow: number;
  card: Vec3 & { rx: number; ry: number; rz: number };
  /** Cover rotation about the card's top hinge: 0 closed .. -PI open. */
  cover: number;
  camera: { pos: Vec3; look: Vec3 };
  /** 0..1 how far Lumi has appeared (overshoots slightly). */
  lumi: number;
  /** Wind strength for the storm: strong while the envelope travels, calm by the time it opens. */
  wind: number;
  /** 0..1 visibility of the storm layers (fades as the card opens, the air clears). */
  storm: number;
};

/** Distance at which a w x h rectangle fits a viewport of this aspect with some margin. */
export function fitDistance(w: number, h: number, aspect: number, margin = 1.1): number {
  const tan = Math.tan((FOV * Math.PI) / 360);
  return Math.max((h * margin) / 2 / tan, (w * margin) / 2 / (aspect * tan));
}

/** Where the open card sits in the world when it is being read (page centre, facing the camera). */
export const READ = {
  /** world z of the card's front plane when reading */
  z: 1.4,
  /** the page centre y: puts the card spread's centre at y = 0 */
  pageY: -DIM.cardH / 2,
};

/** Camera framing for reading. Wide screens fit the whole spread; narrow screens fit the page width and keep the cover's lower part above it. */
export function readingCamera(aspect: number): { dist: number; ty: number } {
  const spreadH = DIM.cardH * 2;
  const fitAll = fitDistance(DIM.cardW, spreadH, aspect, 1.3); // leaves room under the card for the Continue button
  const fitWidth = fitDistance(DIM.cardW, DIM.cardH, aspect, 1.06);
  // On a phone the full spread would force a distance that makes the page small: prefer a slightly tighter frame that keeps the page wide
  // and shows most of the cover (where Lumi and the photo float).
  const dist = aspect < 0.9 ? Math.max(fitWidth, fitAll * 0.82) : fitAll;
  const ty = aspect < 0.9 ? -DIM.cardH * 0.18 : 0;
  return { dist, ty };
}

/**
 * Rectangle of the card's PAGE (where the message is set) as fractions of the viewport (0..1, origin top-left), for the final reading camera.
 * The DOM greeting is positioned with this, so the text sits on the 3D paper.
 */
export function pageRect(aspect: number): { left: number; top: number; width: number; height: number } {
  const { dist, ty } = readingCamera(aspect);
  const visH = 2 * dist * Math.tan((FOV * Math.PI) / 360);
  const visW = visH * aspect;
  const left = 0.5 - DIM.cardW / 2 / visW;
  const width = DIM.cardW / visW;
  const topWorld = READ.pageY + DIM.cardH / 2; // page top edge
  const top = 0.5 - (topWorld - ty) / visH;
  return { left, top, width, height: DIM.cardH / visH };
}

export function poseAt(tIn: number, aspect: number): Pose {
  const t = Math.max(0, tIn);
  const phone = aspect < 0.9;
  const env = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  const ax = seg(t, 0, T.arriveEnd);
  const arrive = ax * ax * (3 - 2 * ax); // S-curve: it picks up speed through the storm, then eases to a stop in front of us
  const inv = 1 - arrive;
  // A long drifting path: starts far away, up and to the right, sways and tumbles gently, and slows to a stop in front of us.
  env.z = lerp(-36, 0, arrive);
  env.x = lerp(phone ? 2.4 : 5.2, 0, arrive) + Math.sin(t * 1.15) * 0.55 * inv;
  env.y = lerp(phone ? 2.6 : 2.4, 0, arrive) + Math.sin(t * 1.7 + 1) * 0.28 * inv;
  env.rz = 0.42 * inv + Math.sin(t * 1.3) * 0.16 * inv;
  env.ry = -0.85 * inv + Math.sin(t * 0.9 + 2) * 0.22 * inv;
  env.rx = 0.38 * inv + Math.sin(t * 1.1) * 0.1 * inv;
  // After arrival it floats in place, a very small bob so it never looks pinned.
  const bob = seg(t, T.arriveEnd * 0.7, T.arriveEnd) * (1 - seg(t, T.slideEnd, T.turnEnd));
  env.y += Math.sin(t * 1.6) * 0.035 * bob;
  env.rz += Math.sin(t * 1.1) * 0.012 * bob;

  const flap = easeInOutCubic(seg(t, T.flapStart, T.flapEnd)) * 2.95;
  const glow = easeInOutSine(seg(t, T.glowStart, T.glowEnd)) * (1 - 0.7 * seg(t, T.turnStart, T.openEnd));

  const envBase = { ...env }; // before the envelope falls away: the card rides inside it until it has slid out
  // The envelope falls away and out of frame while the card turns toward us.
  const leave = easeInOutCubic(seg(t, T.turnStart + 0.1, T.turnEnd + 0.4));
  env.y -= leave * 8.5;
  env.z -= leave * 2.5;
  env.rx += leave * 0.5;
  env.rz += leave * 0.2;

  // Card: inside the envelope -> slides up out of it -> turns and comes toward the camera -> opens.
  const slide = easeInOutCubic(seg(t, T.slideStart, T.slideEnd));
  const turn = easeInOutCubic(seg(t, T.turnStart, T.turnEnd));
  const cardLocalY = slide * (DIM.envH * 0.98);
  // Inside the envelope the card moves with it (position AND orientation), offset along the envelope's own axes.
  const off = rotateXYZ({ x: 0, y: cardLocalY, z: 0.03 }, envBase.rx, envBase.ry, envBase.rz);
  const card = { x: envBase.x + off.x, y: envBase.y + off.y, z: envBase.z + off.z, rx: envBase.rx, ry: envBase.ry, rz: envBase.rz };
  // While sliding it tilts a little; while turning it swings from a three-quarter view to face-on and comes forward.
  // (no yaw or tilt while it is still inside the pocket: it must slide straight out without touching the panels)
  card.ry += -0.72 * (1 - turn) * easeInOutSine(seg(t, T.slideEnd - 0.05, T.slideEnd + 0.55));
  card.rx = card.rx * (1 - turn) + 0.1 * Math.sin(turn * Math.PI);
  card.rz = card.rz * (1 - turn) - 0.07 * Math.sin(turn * Math.PI);
  const openP = seg(t, T.openStart, T.openEnd);
  const open = easeInOutCubic(openP) + Math.sin(openP * Math.PI) * 0.045 * (openP < 1 ? 1 : 0); // a touch of overshoot as it swings
  const finalClosedY = 0; // the closed card is centred while turning
  card.x = lerp(card.x, 0, turn);
  card.y = lerp(card.y, finalClosedY, turn);
  card.z = lerp(card.z, READ.z, turn);
  // As it opens, shift the whole card down so the opened spread is centred in view.
  card.y = lerp(card.y, READ.pageY, easeInOutCubic(openP));
  const cover = -Math.PI * Math.min(open, 1.0);

  // Camera: follows the envelope in, then frames the card.
  const read = readingCamera(aspect);
  const distArrive = Math.max(fitDistance(DIM.envW, DIM.envH, aspect, 1.55), 6.4);
  const distSettled = Math.max(fitDistance(DIM.envW, DIM.envH * 1.9, aspect, 1.12), 5.4);
  const dollyIn = easeInOutSine(seg(t, T.arriveEnd - 1.4, T.slideEnd));
  let dist = lerp(distArrive + 1.6 * inv, distSettled, dollyIn);
  const toRead = easeInOutCubic(seg(t, T.turnStart, T.openEnd));
  dist = lerp(dist, read.dist, toRead);
  const follow = 0.38 * inv; // while it arrives, the camera follows the envelope sideways and up
  const lookY = lerp(env.y * 0.5 + 0.45 * easeInOutSine(seg(t, T.slideStart, T.slideEnd)), read.ty, toRead);
  const lookX = lerp(env.x * follow, 0, toRead);
  const lookZ = lerp(env.z * 0.04, READ.z, toRead);
  const camera = {
    pos: { x: lookX * 0.55 + Math.sin(t * 0.35) * 0.06 * (1 - toRead), y: lookY + 0.18 * (1 - toRead), z: lookZ + dist },
    look: { x: lookX, y: lookY, z: lookZ },
  };

  const lumi = easeOutBack(seg(t, T.lumiStart, T.lumiEnd), 1.9);
  const wind = (1 - seg(t, T.arriveEnd * 0.6, T.flapEnd)) * 1 + 0.15;
  const storm = 1 - 0.55 * seg(t, T.slideEnd, T.openEnd);

  return { envelope: env, flap, glow, card, cover, camera, lumi: seg(t, T.lumiStart, T.lumiEnd) > 0 ? lumi : 0, wind, storm };
}
