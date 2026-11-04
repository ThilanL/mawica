export const navLinks = [
  { label: "Christmas Cards", href: "/#christmas" },
  { label: "New Year Cards", href: "/#new-year" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "About", href: "/#about" },
] as const;

export type CardTheme =
  | "snow-globe"
  | "golden-tree"
  | "winter-village"
  | "starlit"
  | "fireworks"
  | "countdown";

export type CardPreview = {
  id: string;
  theme: CardTheme;
  occasion: "Christmas" | "New Year";
  title: string;
  blurb: string;
};

export const cardPreviews: CardPreview[] = [
  { id: "snow-globe", theme: "snow-globe", occasion: "Christmas", title: "Snow Globe Night", blurb: "A tiny glowing village, shaken into a snowy hush." },
  { id: "golden-tree", theme: "golden-tree", occasion: "Christmas", title: "Golden Tree", blurb: "A tree that lights up, one warm bauble at a time." },
  { id: "winter-village", theme: "winter-village", occasion: "Christmas", title: "Winter Village", blurb: "Lantern-lit rooftops under a soft falling snow." },
  { id: "starlit", theme: "starlit", occasion: "Christmas", title: "Starlit Wish", blurb: "Make a wish beneath the brightest star of the season." },
  { id: "fireworks", theme: "fireworks", occasion: "New Year", title: "Midnight Fireworks", blurb: "Welcome the new year with a sky full of colour." },
  { id: "countdown", theme: "countdown", occasion: "New Year", title: "Golden Countdown", blurb: "Ten seconds to midnight, then a shower of gold." },
];

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
