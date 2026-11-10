/**
 * Allowance periods, pure and UTC-only (no time zone, no daylight saving, no client input).
 * A period is `months` calendar months long and anchored on a FIXED instant (the account anniversary). Boundaries are
 * computed from the anchor each time (anchor + n months, day-of-month clamped), never by adding to the previous boundary,
 * so 31 Jan gives 28/29 Feb and returns to 31 Mar instead of drifting.
 */
export type Period = { start: Date; end: Date; index: number };

function boundary(anchor: Date, n: number, months: number): Date {
  const total = anchor.getUTCMonth() + n * months;
  const y = anchor.getUTCFullYear() + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(anchor.getUTCDate(), lastDay), anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds()));
}

export function periodFor(anchor: Date, now: Date, months = 1): Period {
  if (!Number.isInteger(months) || months < 1) throw new RangeError("months must be a positive integer");
  const guess = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (now.getUTCMonth() - anchor.getUTCMonth());
  let n = Math.max(0, Math.floor(guess / months));
  while (n > 0 && boundary(anchor, n, months) > now) n--;
  while (boundary(anchor, n + 1, months) <= now) n++;
  return { start: boundary(anchor, n, months), end: boundary(anchor, n + 1, months), index: n };
}
