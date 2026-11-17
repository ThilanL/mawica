/**
 * Text layout for the personal wish shown inside AR (pure: no DOM, no three.js, so it is unit-tested). Text is cut by grapheme, never inside an
 * emoji or an accented letter, and drawn by the phone's own fonts. The panel holds a capped excerpt; the full message stays in the HTML overlay.
 */
export type WishText = { name: string; greeting: string; message: string; sender: string };
export type Measure = (text: string) => number;

/** Longest message excerpt drawn on the 3D panel (the full message, up to 500 characters, is in the overlay). */
export const PANEL_MESSAGE_MAX = 220;
export const PANEL_MESSAGE_LINES = 7;

const seg = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
export const graphemes = (s: string): string[] => (seg ? [...seg.segment(s)].map((x) => x.segment) : Array.from(s));

/** Right-to-left if the first strong character is Hebrew or Arabic script. */
export function isRtl(s: string) {
  const m = s.match(/[A-Za-zÀ-ɏͰ-ϿЀ-ӿ֐-׿؀-ۿݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/);
  return !!m && /[֐-׿؀-ۿݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/.test(m[0]);
}

/** Shortens to at most `max` graphemes, preferring a word boundary, and adds an ellipsis when anything was cut. */
export function capText(s: string, max: number) {
  const g = graphemes(s.trim());
  if (g.length <= max) return s.trim();
  let cut = g.slice(0, max - 1).join("");
  const space = cut.search(/\s\S*$/);
  if (space > cut.length * 0.6) cut = cut.slice(0, space);
  return `${cut.replace(/[\s,;:.\-–—]+$/u, "")}…`;
}

/** Wraps text to a width, keeping the author's line breaks; a word wider than the line is broken between graphemes. */
export function wrapLines(text: string, width: number, measure: Measure): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    if (!para.trim()) { if (out.length && out[out.length - 1] !== "") out.push(""); continue; }
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next) <= width) { line = next; continue; }
      if (line) out.push(line);
      if (measure(word) <= width) { line = word; continue; }
      line = "";
      for (const ch of graphemes(word)) { if (measure(line + ch) > width && line) { out.push(line); line = ch; } else line += ch; }
    }
    if (line) out.push(line);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

/** Limits wrapped lines, ending the last kept line with an ellipsis if lines were dropped. */
export function clampLines(lines: string[], max: number, width: number, measure: Measure) {
  if (lines.length <= max) return { lines, clipped: false };
  const kept = lines.slice(0, max);
  let last = kept[max - 1];
  while (last && measure(`${last}…`) > width) last = graphemes(last).slice(0, -1).join("");
  kept[max - 1] = `${last.replace(/\s+$/, "")}…`;
  return { lines: kept, clipped: true };
}

/** Lays out the panel: "For name", greeting, message excerpt, "With love, sender". `clipped` tells the overlay to say the full message is below. */
export function layoutWish(w: WishText, width: number, measure: { body: Measure; title: Measure; small: Measure }) {
  const name = capText(w.name, 40), sender = capText(w.sender, 40);
  const excerpt = capText(w.message, PANEL_MESSAGE_MAX);
  const wrapped = clampLines(wrapLines(excerpt, width, measure.body), PANEL_MESSAGE_LINES, width, measure.body);
  return {
    for: clampLines(wrapLines(`For ${name}`, width, measure.small), 1, width, measure.small).lines[0] ?? "",
    greeting: clampLines(wrapLines(w.greeting, width, measure.title), 2, width, measure.title).lines,
    message: wrapped.lines,
    from: clampLines(wrapLines(`With love, ${sender}`, width, measure.small), 1, width, measure.small).lines[0] ?? "",
    clipped: wrapped.clipped || excerpt !== w.message.trim(),
    rtl: isRtl(w.message),
  };
}
