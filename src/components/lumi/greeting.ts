/** Pure text helpers for the "Meet Lumi" sample greeting (kept out of the client component so they are unit tested). */

export const NAME_MAX = 40;

// Controls, zero-width space, BOM, and bidi overrides/isolates/marks are removed. ZWJ (U+200D) and ZWNJ (U+200C)
// are deliberately kept: Sinhala, Tamil, Persian and emoji sequences need them.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f​‎‏‪-‮⁦-⁩﻿]/g;

/** Display-only normalisation: NFC, strip unsafe characters, collapse whitespace, cap at NAME_MAX characters. */
export function cleanName(raw: string): string {
  const s = raw.normalize("NFC").replace(UNSAFE, "").replace(/\s+/g, " ").trim().replace(/[.!?,;:]+$/u, "");
  // Array.from counts code points, so emoji and astral characters are never cut in half.
  return Array.from(s).slice(0, NAME_MAX).join("");
}

export function sampleGreeting(name: string): { line: string; body: string } {
  const n = cleanName(name);
  return {
    line: n ? `A little magic for ${n}.` : "A little magic for you.",
    body: "Wishing you warmth, joy and a very merry Christmas.",
  };
}
