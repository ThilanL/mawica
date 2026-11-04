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
  src: "/art/hero/globe@2x.webp",
  alt: "A glass snow globe holding a snowy village and an illuminated Christmas tree, on a rose-gold base with pine, baubles and pine cones",
  width: 2400,
  height: 2720,
  /** Flip to false only when final, approved artwork is in place. Shows the "temporary artwork" note while true. */
  isPlaceholder: false,
  /** Transparent margin (% of image height) trimmed from the layout box above and below the subject */
  crop: { top: 17, bottom: 18 },
  /** CSS clip-path that confines snowfall to the inside of the glass (measured on globe@2x.webp) */
  snowClip: "circle(22.7% at 50.2% 42%)",
  lights: [
    { x: 49.4, y: 30.9, color: "gold", size: 14, delay: 0 },
    { x: 49.4, y: 40.8, color: "rose", size: 8, delay: 0.6 },
    { x: 49.1, y: 51.2, color: "gold", size: 9, delay: 1.1 },
    { x: 39.6, y: 48, color: "gold", size: 7, delay: 0.3 },
    { x: 36.5, y: 52, color: "gold", size: 7, delay: 0.9 },
    { x: 60.8, y: 52.2, color: "gold", size: 7, delay: 0.5 },
    { x: 56.5, y: 51.7, color: "gold", size: 6, delay: 1.3 },
    { x: 31.3, y: 49.2, color: "gold", size: 6, delay: 0.2 },
    { x: 44, y: 44, color: "gold", size: 6, delay: 1 },
    { x: 55, y: 42, color: "rose", size: 7, delay: 0.7 },
    { x: 52.5, y: 58, color: "gold", size: 7, delay: 1.4 },
    { x: 22.9, y: 72.4, color: "gold", size: 6, delay: 0.4 },
  ] satisfies HeroLight[],
} as const;
