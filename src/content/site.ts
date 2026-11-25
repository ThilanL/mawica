export const navLinks = [
  { label: "Christmas Cards", href: "/#christmas" },
  { label: "New Year Cards", href: "/#new-year" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "About", href: "/about" },
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
  { icon: "free", title: "Free to create", body: "Make and share a card without paying a cent." },
  { icon: "phone", title: "Made for phones", body: "Every card is designed for the screen it will most likely be opened on." },
  { icon: "share", title: "Share your way", body: "One unique link that works in WhatsApp, messages, email or a QR code." },
  { icon: "heart", title: "Personal by design", body: "Your words, their name, wrapped in a moment that feels handmade." },
] as const;

/** The two headline features in "Why mawica." Keep these claims in step with ArButton/arSupport and the scheduling module. */
export const featureAr = {
  eyebrow: "View in AR",
  title: "Bring the card into their room",
  body: "The Christmas Snow Globe, Magical Christmas Tree and A Special Gift cards step off the screen. Your recipient taps View in AR, places the card on the floor, walks around it, then taps it to read your wish up close.",
  points: [
    "iPhone and iPad with AR Quick Look",
    "Android phones with Chrome and ARCore",
    "On a computer? Scan the QR code to open it on a phone",
    "The wish is built on their phone: nothing is uploaded",
  ],
} as const;

export const featureSchedule = {
  eyebrow: "Schedule for later",
  title: "Write it today. Deliver it right on time.",
  body: "Signed in, pick a date, a time and a time zone. Your card stays private until that moment, then goes live for you to share with its link.",
  points: [
    "Christmas morning, midnight on New Year's Eve, or any moment that matters",
    "Time zones and daylight saving handled for you",
    "Change the time or cancel before it goes live",
  ],
} as const;

/** Launch markets shown in the footer's world band (city, ISO country, IANA zone, coordinates for the map). */
export const launchMarkets = [
  { city: "Sydney", country: "Australia", code: "AU", tz: "Australia/Sydney", lat: -33.87, lon: 151.21 },
  { city: "London", country: "United Kingdom", code: "GB", tz: "Europe/London", lat: 51.51, lon: -0.13 },
  { city: "New York", country: "United States", code: "US", tz: "America/New_York", lat: 40.71, lon: -74.01 },
  { city: "Stockholm", country: "Sweden", code: "SE", tz: "Europe/Stockholm", lat: 59.33, lon: 18.07 },
  { city: "Helsinki", country: "Finland", code: "FI", tz: "Europe/Helsinki", lat: 60.17, lon: 24.94 },
  { city: "Dubai", country: "United Arab Emirates", code: "AE", tz: "Asia/Dubai", lat: 25.2, lon: 55.27 },
  { city: "Colombo", country: "Sri Lanka", code: "LK", tz: "Asia/Colombo", lat: 6.93, lon: 79.85 },
] as const;
