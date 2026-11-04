/**
 * Data-driven card templates. Adding a card = add an entry here and a scene
 * component in src/components/cards/scenes (registered in scenes/index.ts).
 * Nothing here touches the database.
 */
export const TEMPLATE_KEYS = ["snow-globe"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export type CardTemplate = {
  key: TemplateKey;
  title: string;
  occasion: "Christmas" | "New Year";
  description: string;
  /** Heading shown on the final greeting */
  greeting: string;
  defaultMessage: string;
};

export const templates: Record<TemplateKey, CardTemplate> = {
  "snow-globe": {
    key: "snow-globe",
    title: "Snow Globe Night",
    occasion: "Christmas",
    description: "A tiny glowing village, shaken into a snowy hush.",
    greeting: "Merry Christmas",
    defaultMessage: "Wishing you warmth, joy and a little magic this Christmas.",
  },
};

export const isTemplateKey = (v: string): v is TemplateKey => (TEMPLATE_KEYS as readonly string[]).includes(v);
