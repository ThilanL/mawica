export const navLinks = [
  { label: "Christmas Cards", href: "/#christmas" },
  { label: "New Year Cards", href: "/#new-year" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "About", href: "/#about" },
] as const;

import { templates, TEMPLATE_KEYS, type TemplateKey } from "@/modules/templates/registry";

export type CardTheme = TemplateKey;

export type CardPreview = {
  id: string;
  theme: CardTheme;
  occasion: "Christmas" | "New Year";
  title: string;
  blurb: string;
};

/** Landing-page previews are derived from the template registry so they never drift. */
export const cardPreviews: CardPreview[] = TEMPLATE_KEYS.map((k) => ({
  id: k, theme: k, occasion: templates[k].occasion, title: templates[k].title, blurb: templates[k].description,
}));

export const steps = [
  { n: "01", title: "Create", body: "Choose a card from our Christmas and New Year collection." },
  { n: "02", title: "Personalise", body: "Add the recipient's name, your name and a heartfelt message." },
  { n: "03", title: "Share", body: "Send it with a link, on WhatsApp, or as a QR code." },
] as const;

export const benefits = [
  { title: "Free to create", body: "Make and share a card without paying a cent." },
  { title: "Made for phones", body: "Every card is designed for the screen it will most likely be opened on." },
  { title: "Share your way", body: "One unique link that works in WhatsApp, messages, email or a QR code." },
  { title: "Personal by design", body: "Your words, their name, wrapped in a moment that feels handmade." },
] as const;
