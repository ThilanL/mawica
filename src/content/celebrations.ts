/**
 * Cinematic homepage hero — three celebration scenes (Christmas → Birthday → Wedding).
 * Videos: see `public/art/hero/videos/ASSETS.md`.
 */

export type CelebrationId = "christmas" | "birthday" | "wedding";

export type CelebrationTheme = {
  /** Accent for selector / particles */
  accent: string;
  /** Soft veil behind left-side copy */
  veil: string;
  particle: "snow" | "confetti" | "petals";
};

export type Celebration = {
  id: CelebrationId;
  label: string;
  eyebrow: string;
  titleLines: readonly [string, string];
  body: string;
  cta: string;
  video: string;
  poster: string;
  /** Seconds to hold the scene before crossfading. */
  durationSec: number;
  theme: CelebrationTheme;
};

/** Crossfade length shared by video + copy transitions. */
export const HERO_CROSSFADE_MS = 1200;

export const celebrations: readonly Celebration[] = [
  {
    id: "christmas",
    label: "Christmas",
    eyebrow: "Christmas Magic 2026",
    titleLines: ["A Little Magic.", "A Lot of Love."],
    body: "Create beautiful 3D Christmas greetings that feel as special as the people you care about.",
    cta: "Create Your Free Card",
    video: "/art/hero/videos/christmas.mp4",
    poster: "/art/hero/videos/christmas-poster.webp",
    durationSec: 6,
    theme: {
      accent: "#c9a227",
      veil: "linear-gradient(90deg, rgb(255 248 244 / 0.96) 0%, rgb(255 248 244 / 0.86) 38%, rgb(255 248 244 / 0.45) 58%, transparent 78%)",
      particle: "snow",
    },
  },
  {
    id: "birthday",
    label: "Birthday",
    eyebrow: "Make Every Birthday Magical",
    titleLines: ["Make Every Birthday", "Unforgettable."],
    body: "Turn birthday wishes into magical moments with beautiful, personalised 3D greeting cards.",
    cta: "Create Your Free Card",
    video: "/art/hero/videos/birthday.mp4",
    poster: "/art/hero/videos/birthday-poster.webp",
    durationSec: 6,
    theme: {
      accent: "#e8a0bf",
      veil: "linear-gradient(90deg, rgb(255 246 250 / 0.96) 0%, rgb(255 246 250 / 0.86) 38%, rgb(255 246 250 / 0.45) 58%, transparent 78%)",
      particle: "confetti",
    },
  },
  {
    id: "wedding",
    label: "Wedding",
    eyebrow: "Celebrate Forever",
    // nbsp keeps "Love Story" together so the phrase cannot wrap to three ragged lines
    titleLines: ["Every Love\u00A0Story", "Deserves Magic."],
    body: "Celebrate beautiful beginnings with unforgettable personalised wedding greetings.",
    cta: "Create Your Free Card",
    video: "/art/hero/videos/wedding.mp4",
    poster: "/art/hero/videos/wedding-poster.webp",
    durationSec: 6,
    theme: {
      accent: "#e8c9a0",
      veil: "linear-gradient(90deg, rgb(255 250 246 / 0.97) 0%, rgb(255 250 246 / 0.9) 40%, rgb(255 250 246 / 0.5) 60%, transparent 80%)",
      particle: "petals",
    },
  },
] as const;

export const celebrationById = Object.fromEntries(celebrations.map((c) => [c.id, c])) as Record<
  CelebrationId,
  Celebration
>;

export function nextCelebrationIndex(index: number): number {
  return (index + 1) % celebrations.length;
}
