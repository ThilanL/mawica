/**
 * Minimal template → occasion map for analytics.
 * Mirrors consumer registry keys without importing default messages or media.
 */

const OCCASION_BY_KEY: Record<string, string> = {
  "snow-globe": "Christmas",
  "christmas-tree": "Christmas",
  "special-gift": "Christmas",
  "warm-wishes": "Christmas",
  "new-year-2027": "New Year",
  "new-year-celebration": "New Year",
  "lumis-wish": "Any occasion",
  "lumis-wish-cinema": "Any occasion",
};

export function occasionForTemplateKey(templateKey: string): string {
  return OCCASION_BY_KEY[templateKey] ?? "Unknown / legacy";
}
