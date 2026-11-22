/** Emotional family-connection CTA — homepage closing section. */

export const finalCtaCopy = {
  eyebrow: "Send a Little Magic",
  titleLines: ["A Little Wish.", "A Lifetime of Love."] as const,
  body: "Near or far, make someone feel remembered. Create a beautiful personalised 3D greeting and send a little happiness straight to their heart.",
  cta: "Create Your Free Card",
  note: "Made with love. Shared in seconds.",
} as const;

export const finalCtaArt = {
  /** Native source ~1024×448; desktop uses the upscaled webp for large viewports. */
  desktop: {
    src: "/art/cta/family-connection-desktop.webp",
    width: 2400,
    height: 1050,
  },
  mobile: {
    src: "/art/cta/family-connection-mobile.webp",
    width: 1400,
    height: 612,
  },
  alt: "Grandchildren creating a digital greeting on a tablet, and grandparents joyfully receiving it on theirs",
} as const;
