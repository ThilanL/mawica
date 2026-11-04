/**
 * Hero artwork configuration.
 *
 * To ship the final hyper-realistic snow globe: drop the render into
 * `public/hero/`, update `src`, `alt`, `width`, `height`, set `isPlaceholder`
 * to false, then re-measure `snowClip` and `lights` (percentages of the image).
 * Layout and animation code does not need to change.
 */
export type HeroLight = {
  /** Horizontal position, % of image width */
  x: number;
  /** Vertical position, % of image height */
  y: number;
  color: "gold" | "rose";
  /** Glow diameter, % of image width */
  size: number;
  /** Twinkle delay in seconds */
  delay: number;
};

export const heroArtwork = {
  src: "/hero/snow-globe-placeholder.svg",
  alt: "A glass snow globe holding a small illuminated village and a Christmas tree",
  width: 600,
  height: 680,
  isPlaceholder: true,
  /** CSS clip-path that confines snowfall to the inside of the globe */
  snowClip: "circle(39.5% at 50% 42.6%)",
  lights: [
    { x: 47.5, y: 38.5, color: "gold", size: 9, delay: 0 },
    { x: 53, y: 40.6, color: "rose", size: 9, delay: 0.6 },
    { x: 44.7, y: 46.8, color: "rose", size: 9, delay: 1.1 },
    { x: 55, y: 48, color: "gold", size: 9, delay: 0.3 },
    { x: 41.3, y: 57, color: "gold", size: 9, delay: 0.9 },
    { x: 50, y: 54.7, color: "rose", size: 9, delay: 1.4 },
    { x: 58.7, y: 57.6, color: "gold", size: 9, delay: 0.5 },
    { x: 30, y: 64, color: "gold", size: 7, delay: 0.2 },
    { x: 33.5, y: 64, color: "gold", size: 7, delay: 1 },
    { x: 67.5, y: 64.5, color: "gold", size: 7, delay: 0.7 },
    { x: 71, y: 64.5, color: "gold", size: 7, delay: 1.3 },
    { x: 50, y: 28.5, color: "gold", size: 14, delay: 0.4 },
  ] satisfies HeroLight[],
} as const;
