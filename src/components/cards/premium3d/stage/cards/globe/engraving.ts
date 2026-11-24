import { capText } from "../../../ar/wish";

/**
 * The personal engraving on the back of the base, from the card's own names (decision D4: no new field, nothing stored). Pure, so it is tested.
 * Two short lines in the cartouche: "For {recipient}" in italic, then "With love, {sender}".
 * - Emoji are left out: engraving is a single-colour cut-out, and a colour emoji would come out as a solid gold blob.
 * - Names are cut by grapheme (never inside an accented letter) so they fit the 54 mm plate; an empty name leaves just the gold frame.
 * - Right-to-left names keep the phrase order: the line is laid out left to right and the browser's bidi places the name correctly.
 */
export const ENGRAVING_NAME_MAX = 24;
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u200D\uFE0F\u20E3]|[\u{1F3FB}-\u{1F3FF}]/gu;
export const engravable = (name: string) => (name ?? "").replace(EMOJI, "").replace(/\s+/g, " ").trim();

export function engravingLines(recipient: string, sender: string): string[] {
  const to = capText(engravable(recipient), ENGRAVING_NAME_MAX), from = capText(engravable(sender), ENGRAVING_NAME_MAX);
  const lines: string[] = [];
  if (to) lines.push(`For ${to}`);
  if (from) lines.push(`With love, ${from}`);
  return lines;
}
