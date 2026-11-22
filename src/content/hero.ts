/**
 * Homepage hero — shared chrome (benefits, legacy layered plates for fallbacks).
 * Celebration scenes / video paths live in `celebrations.ts`.
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

/**
 * Transparent snow globe still shipped for reduced-motion / no-video fallbacks
 * and catalogue separation. The cinematic hero prefers celebration video posters.
 */
export const heroArtwork = {
  src: "/art/hero/snow-globe-mawica.webp",
  srcMobile: "/art/hero/snow-globe-mawica-sm.webp",
  alt: "A glass snow globe with an illuminated Christmas village on a golden Mawica base",
  width: 1154,
  height: 1310,
  widthMobile: 577,
  heightMobile: 655,
  isPlaceholder: false,
  crop: { top: 0, bottom: 0 },
  snowClip: "circle(34% at 50% 42%)",
  lights: [] as HeroLight[],
} as const;

export type HeroPlate = { src: string; width: number; height: number; position?: string };

/** Scenic plates retained as offline / reduced-motion atmosphere fallbacks. */
export const heroPlates: {
  desktop?: HeroPlate;
  mobile?: HeroPlate;
  ornaments?: HeroPlate;
} = {
  desktop: {
    src: "/art/hero/christmas-bg-desktop.webp",
    width: 2400,
    height: 1200,
    position: "center bottom",
  },
  mobile: {
    src: "/art/hero/christmas-bg-mobile.webp",
    width: 1200,
    height: 600,
    position: "70% bottom",
  },
};

/** Shared CTA + benefit row (celebration-specific copy lives in celebrations.ts). */
export const heroCopy = {
  cta: "Create Your Free Card",
  annotation: ["Because", "moments like these", "matter."] as const,
  benefits: [
    { id: "heart", label: "Free to create" },
    { id: "sparkles", label: "Beautiful 3D cards" },
    { id: "share", label: "Share instantly" },
  ] as const,
  /** Default (Christmas) strings for SSR / tests that assert first paint. */
  eyebrow: "Christmas Magic 2026",
  titleLines: ["A Little Magic.", "A Lot of Love."] as const,
  body: "Create beautiful 3D Christmas greetings that feel as special as the people you care about.",
} as const;
