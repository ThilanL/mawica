/**
 * Time-zone and horizon arithmetic for scheduling. Pure and dependency-free (Intl only), so the browser form and the server use the
 * SAME code. The server re-validates everything; the browser only previews.
 *
 * Policy (documented, deterministic, never silent):
 *  - A requested local wall-clock time that does not exist (spring-forward gap) is REJECTED with the nearest valid time suggested;
 *    it is never shifted for the user.
 *  - A local time that occurs twice (fall-back overlap) is REJECTED until the sender chooses "earlier" or "later" explicitly.
 *  - The scheduling horizon is N calendar months measured in UTC from the moment of the request (day clamped: 31 Jan + 1 month = 28/29 Feb).
 */
export const MIN_LEAD_MINUTES = 5;
const MIN = 60_000;

export const isKnownTimeZone = (tz: string): boolean => {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
};

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    fmtCache.set(tz, f);
  }
  return f;
}

/** UTC offset (minutes east of UTC) that `tz` has at the given instant. */
export function offsetAt(ms: number, tz: string): number {
  const p = Object.fromEntries(parts(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MIN);
}

export const offsetLabel = (minutes: number): string => `${minutes < 0 ? "-" : "+"}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;

const pad = (n: number) => String(n).padStart(2, "0");
export const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const LOCAL_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Parses a real calendar date. Returns null for impossible dates such as 2026-02-30. */
export function parseLocalDate(s: string): { y: number; m: number; d: number } | null {
  if (!LOCAL_DATE_RE.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d && y >= 2000 && y <= 2200 ? { y, m, d } : null;
}

export type Choice = "earlier" | "later";
export type Resolution =
  | { kind: "ok"; instant: Date; offsetMinutes: number }
  | { kind: "nonexistent"; gapMinutes: number; suggestion: { localDate: string; localTime: string } }
  | { kind: "ambiguous"; options: { choice: Choice; instant: Date; offsetMinutes: number }[] }
  | { kind: "invalid"; reason: "DATE" | "TIME" | "ZONE" };

/** Resolves a local date + time in an IANA zone to an instant, applying the policy above. */
export function resolveLocal(localDate: string, localTime: string, tz: string, choice?: Choice): Resolution {
  const d = parseLocalDate(localDate);
  if (!d) return { kind: "invalid", reason: "DATE" };
  if (!LOCAL_TIME_RE.test(localTime)) return { kind: "invalid", reason: "TIME" };
  if (!isKnownTimeZone(tz)) return { kind: "invalid", reason: "ZONE" };
  const [hh, mm] = localTime.split(":").map(Number);
  const wall = Date.UTC(d.y, d.m - 1, d.d, hh, mm);
  const before = offsetAt(wall - 86_400_000, tz), after = offsetAt(wall + 86_400_000, tz);
  const found = new Map<number, number>(); // instant -> offset
  for (const o of new Set([before, after])) {
    const t = wall - o * MIN;
    if (offsetAt(t, tz) === o) found.set(t, o);
  }
  const hits = [...found.entries()].sort((a, b) => a[0] - b[0]);
  if (hits.length === 0) {
    const gap = Math.abs(after - before);
    const shifted = new Date(wall + gap * MIN);
    return { kind: "nonexistent", gapMinutes: gap, suggestion: { localDate: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`, localTime: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}` } };
  }
  if (hits.length === 1) return { kind: "ok", instant: new Date(hits[0][0]), offsetMinutes: hits[0][1] };
  const options = [{ choice: "earlier" as const, instant: new Date(hits[0][0]), offsetMinutes: hits[0][1] }, { choice: "later" as const, instant: new Date(hits[1][0]), offsetMinutes: hits[1][1] }];
  if (!choice) return { kind: "ambiguous", options };
  const pick = options.find((o) => o.choice === choice)!;
  return { kind: "ok", instant: pick.instant, offsetMinutes: pick.offsetMinutes };
}

/** The wall-clock reading of an instant in a zone (for display and for round-trip checks). */
export function toLocal(instant: Date, tz: string): { localDate: string; localTime: string; offsetMinutes: number } {
  const p = Object.fromEntries(parts(tz).formatToParts(instant).map((x) => [x.type, x.value]));
  return { localDate: `${p.year}-${p.month}-${p.day}`, localTime: `${pad(+p.hour % 24)}:${p.minute}`, offsetMinutes: offsetAt(instant.getTime(), tz) };
}

/** Calendar-month arithmetic on a UTC wall clock with the day clamped to the target month's length. */
export function addCalendarMonthsUTC(d: Date, months: number): Date {
  const total = d.getUTCMonth() + months;
  const y = d.getUTCFullYear() + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
}

export type Window = { earliest: Date; latest: Date };
export const scheduleWindow = (now: Date, monthsAhead: number): Window => ({ earliest: new Date(now.getTime() + MIN_LEAD_MINUTES * MIN), latest: addCalendarMonthsUTC(now, monthsAhead) });

export type WindowCheck = { ok: true } | { ok: false; code: "IN_THE_PAST" | "TOO_FAR"; window: Window };
export function checkWindow(instant: Date, now: Date, monthsAhead: number): WindowCheck {
  const window = scheduleWindow(now, monthsAhead);
  if (instant.getTime() < window.earliest.getTime()) return { ok: false, code: "IN_THE_PAST", window };
  if (instant.getTime() > window.latest.getTime()) return { ok: false, code: "TOO_FAR", window };
  return { ok: true };
}

/** "Friday 12 December 2026, 9:00 am" in the zone, plus its UTC offset label, for confirmations. */
export function describeInstant(instant: Date, tz: string, locale = "en-AU"): string {
  const when = new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }).format(instant);
  return `${when} (${tz.replace(/_/g, " ")}, UTC${offsetLabel(offsetAt(instant.getTime(), tz))})`;
}
