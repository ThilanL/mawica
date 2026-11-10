/**
 * Data-driven card templates. Adding a card = add an entry here and a scene
 * component in src/components/cards/scenes (registered in scenes/index.ts).
 * Nothing here touches the database.
 */
export const TEMPLATE_KEYS = [
  "snow-globe",
  "christmas-tree",
  "special-gift",
  "warm-wishes",
  "new-year-2027",
  "new-year-celebration",
] as const;
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
    key: "snow-globe", title: "Christmas Snow Globe", occasion: "Christmas",
    description: "A tiny glowing village, shaken into a snowy hush.",
    greeting: "Merry Christmas", defaultMessage: "Wishing you warmth, joy and a little magic this Christmas.",
  },
  "christmas-tree": {
    key: "christmas-tree", title: "Magical Christmas Tree", occasion: "Christmas",
    description: "A tree that lights up, bauble by bauble, with a star on top.",
    greeting: "Merry Christmas", defaultMessage: "May every light on your tree remind you how loved you are.",
  },
  "special-gift": {
    key: "special-gift", title: "A Special Gift", occasion: "Christmas",
    description: "A wrapped gift opens in a shower of golden light.",
    greeting: "A gift, just for you", defaultMessage: "The best presents can't be wrapped. This is my way of saying thank you, and Merry Christmas.",
  },
  "warm-wishes": {
    key: "warm-wishes", title: "Warm Christmas Wishes", occasion: "Christmas",
    description: "A cosy window, warm lights and softly falling snow.",
    greeting: "Warm Christmas Wishes", defaultMessage: "Wishing you a cosy, joyful Christmas, full of laughter and the people you love.",
  },
  "new-year-2027": {
    key: "new-year-2027", title: "New Year 2027", occasion: "New Year",
    description: "A cinematic countdown, then golden fireworks.",
    greeting: "Happy New Year 2027", defaultMessage: "Here's to new beginnings, bright days and every wish coming true in 2027.",
  },
  "new-year-celebration": {
    key: "new-year-celebration", title: "New Year Celebration", occasion: "New Year",
    description: "Midnight plum and gold, with glasses raised and confetti.",
    greeting: "Happy New Year", defaultMessage: "Cheers to you. May the year ahead sparkle with joy, health and good company.",
  },
};

export const isTemplateKey = (v: string): v is TemplateKey => (TEMPLATE_KEYS as readonly string[]).includes(v);

/**
 * PREMIUM templates. Kept apart from the six launch cards on purpose: TEMPLATE_KEYS / templates / the homepage gallery stay
 * exactly as shipped (all STANDARD, free to publish). A premium card is reachable only from the creation flow, needs a
 * signed-in account and consumes 1 total + 1 premium credit from the wallet. The tier is resolved HERE, on the server,
 * from the template key. A client-supplied tier is never read.
 */
export const PREMIUM_TEMPLATE_KEYS = ["lumis-wish"] as const;
export type PremiumTemplateKey = (typeof PREMIUM_TEMPLATE_KEYS)[number];
export type AnyTemplateKey = TemplateKey | PremiumTemplateKey;
export const ALL_TEMPLATE_KEYS = [...TEMPLATE_KEYS, ...PREMIUM_TEMPLATE_KEYS] as const;

export type PremiumCardTemplate = Omit<CardTemplate, "key" | "occasion"> & { key: PremiumTemplateKey; occasion: "Any occasion" };

export const premiumTemplates: Record<PremiumTemplateKey, PremiumCardTemplate> = {
  "lumis-wish": {
    key: "lumis-wish", title: "Lumi's Wish", occasion: "Any occasion",
    description: "Lumi, our golden star, wakes up, finds your person and makes a wish just for them.",
    greeting: "Lumi made a wish for you",
    defaultMessage: "Lumi travelled a long way to bring you this wish: may your days be full of warmth, wonder and everything that makes you smile.",
  },
};

export const isPremiumTemplateKey = (v: string): v is PremiumTemplateKey => (PREMIUM_TEMPLATE_KEYS as readonly string[]).includes(v);
export const isAnyTemplateKey = (v: string): v is AnyTemplateKey => isTemplateKey(v) || isPremiumTemplateKey(v);
/** Template data for any card (standard or premium). */
export const getTemplate = (key: AnyTemplateKey): CardTemplate | PremiumCardTemplate => (isPremiumTemplateKey(key) ? premiumTemplates[key] : templates[key]);

export type CardTierName = "STANDARD" | "PREMIUM";
export function templateTier(key: string): CardTierName {
  if (!isAnyTemplateKey(key)) throw new Error(`Unknown template: ${key}`);
  return isPremiumTemplateKey(key) ? "PREMIUM" : "STANDARD";
}
