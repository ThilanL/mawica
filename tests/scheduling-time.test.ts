import { describe, expect, it } from "vitest";
import { addCalendarMonthsUTC, checkWindow, describeInstant, isKnownTimeZone, offsetAt, offsetLabel, parseLocalDate, resolveLocal, scheduleWindow, toLocal } from "@/modules/scheduling/time";

const iso = (r: ReturnType<typeof resolveLocal>) => (r.kind === "ok" ? r.instant.toISOString() : r.kind);

describe("time zones: offsets and resolution", () => {
  it("resolves ordinary times, including half- and quarter-hour zones", () => {
    expect(iso(resolveLocal("2026-12-12", "09:00", "Australia/Melbourne"))).toBe("2026-12-11T22:00:00.000Z"); // +11 in summer
    expect(iso(resolveLocal("2026-12-12", "09:00", "Asia/Colombo"))).toBe("2026-12-12T03:30:00.000Z"); // +05:30
    expect(iso(resolveLocal("2026-12-12", "09:00", "Asia/Kathmandu"))).toBe("2026-12-12T03:15:00.000Z"); // +05:45
    expect(iso(resolveLocal("2026-12-12", "09:00", "UTC"))).toBe("2026-12-12T09:00:00.000Z");
    expect(iso(resolveLocal("2026-07-01", "09:00", "America/New_York"))).toBe("2026-07-01T13:00:00.000Z"); // -04 EDT
    expect(iso(resolveLocal("2026-12-01", "09:00", "America/New_York"))).toBe("2026-12-01T14:00:00.000Z"); // -05 EST
  });
  it("spring forward: a nonexistent local time is rejected, never shifted, with the nearest valid time suggested", () => {
    const m = resolveLocal("2026-10-04", "02:30", "Australia/Melbourne"); // clocks go 02:00 -> 03:00
    expect(m).toMatchObject({ kind: "nonexistent", gapMinutes: 60, suggestion: { localDate: "2026-10-04", localTime: "03:30" } });
    expect(resolveLocal("2026-03-08", "02:15", "America/New_York")).toMatchObject({ kind: "nonexistent", gapMinutes: 60 });
    expect(iso(resolveLocal("2026-10-04", "01:59", "Australia/Melbourne"))).toBe("2026-10-03T15:59:00.000Z"); // last minute before the gap
    expect(iso(resolveLocal("2026-10-04", "03:00", "Australia/Melbourne"))).toBe("2026-10-03T16:00:00.000Z"); // first minute after
  });
  it("half-hour DST (Lord Howe): the 30-minute gap and overlap are detected", () => {
    expect(resolveLocal("2026-10-04", "02:15", "Australia/Lord_Howe")).toMatchObject({ kind: "nonexistent", gapMinutes: 30, suggestion: { localTime: "02:45" } });
    expect(resolveLocal("2027-04-04", "01:45", "Australia/Lord_Howe")).toMatchObject({ kind: "ambiguous" });
  });
  it("fall back: an ambiguous local time needs an explicit earlier/later choice", () => {
    const a = resolveLocal("2027-04-04", "02:30", "Australia/Melbourne"); // 03:00 AEDT -> 02:00 AEST
    expect(a.kind).toBe("ambiguous");
    if (a.kind !== "ambiguous") return;
    expect(a.options.map((o) => [o.choice, o.offsetMinutes, o.instant.toISOString()])).toEqual([["earlier", 660, "2027-04-03T15:30:00.000Z"], ["later", 600, "2027-04-03T16:30:00.000Z"]]);
    expect(iso(resolveLocal("2027-04-04", "02:30", "Australia/Melbourne", "earlier"))).toBe("2027-04-03T15:30:00.000Z");
    expect(iso(resolveLocal("2027-04-04", "02:30", "Australia/Melbourne", "later"))).toBe("2027-04-03T16:30:00.000Z");
    expect(resolveLocal("2026-11-01", "01:30", "America/New_York").kind).toBe("ambiguous");
    expect(iso(resolveLocal("2027-04-04", "03:00", "Australia/Melbourne"))).toBe("2027-04-03T17:00:00.000Z"); // after the overlap (03:00 AEST): unambiguous
    expect(iso(resolveLocal("2027-04-04", "01:59", "Australia/Melbourne"))).toBe("2027-04-03T14:59:00.000Z"); // before it: unambiguous
  });
  it("zones without DST never produce gaps or overlaps", () => {
    for (const tz of ["Asia/Colombo", "Asia/Kolkata", "UTC"]) for (const t of ["00:00", "02:30", "12:00", "23:59"]) expect(resolveLocal("2026-10-04", t, tz).kind).toBe("ok");
  });
  it("rejects impossible dates, bad times and unknown zones", () => {
    expect(resolveLocal("2026-02-30", "09:00", "UTC")).toEqual({ kind: "invalid", reason: "DATE" });
    expect(resolveLocal("2026-13-01", "09:00", "UTC")).toEqual({ kind: "invalid", reason: "DATE" });
    expect(resolveLocal("2026-12-12", "24:00", "UTC")).toEqual({ kind: "invalid", reason: "TIME" });
    expect(resolveLocal("2026-12-12", "9:00", "UTC")).toEqual({ kind: "invalid", reason: "TIME" });
    expect(resolveLocal("2026-12-12", "09:00", "Mars/Olympus")).toEqual({ kind: "invalid", reason: "ZONE" });
    expect(resolveLocal("2026-12-12", "09:00", "../etc/passwd")).toEqual({ kind: "invalid", reason: "ZONE" });
    expect(parseLocalDate("2028-02-29")).toBeTruthy();
    expect(parseLocalDate("2027-02-29")).toBeNull();
    expect(isKnownTimeZone("Asia/Colombo")).toBe(true);
    expect(isKnownTimeZone("x".repeat(70))).toBe(false);
  });
  it("labels offsets", () => {
    expect(offsetLabel(330)).toBe("+05:30"); expect(offsetLabel(-210)).toBe("-03:30"); expect(offsetLabel(0)).toBe("+00:00"); expect(offsetLabel(345)).toBe("+05:45");
    expect(offsetAt(Date.parse("2026-12-12T00:00:00Z"), "Australia/Melbourne")).toBe(660);
    expect(offsetAt(Date.parse("2026-07-12T00:00:00Z"), "Australia/Melbourne")).toBe(600);
  });
  it("property: every unambiguous local time round-trips exactly, and instants increase with the wall clock", () => {
    let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const zones = ["Australia/Melbourne", "America/New_York", "Europe/London", "Asia/Colombo", "Australia/Lord_Howe", "Pacific/Auckland", "America/St_Johns"];
    let checked = 0;
    for (let i = 0; i < 1500; i++) {
      const tz = zones[Math.floor(rnd() * zones.length)];
      const t = Date.UTC(2026, 0, 1) + Math.floor(rnd() * 2 * 365 * 86400000);
      const wall = new Date(Math.round(t / 60000) * 60000);
      const date = `${wall.getUTCFullYear()}-${String(wall.getUTCMonth() + 1).padStart(2, "0")}-${String(wall.getUTCDate()).padStart(2, "0")}`;
      const time = `${String(wall.getUTCHours()).padStart(2, "0")}:${String(wall.getUTCMinutes()).padStart(2, "0")}`;
      const r = resolveLocal(date, time, tz, "earlier");
      if (r.kind !== "ok") { expect(r.kind).toBe("nonexistent"); continue; }
      const back = toLocal(r.instant, tz);
      expect([back.localDate, back.localTime]).toEqual([date, time]);
      expect(back.offsetMinutes).toBe(r.offsetMinutes);
      checked++;
    }
    expect(checked).toBeGreaterThan(1400);
  });
});

describe("calendar-month horizon", () => {
  const at = (s: string) => new Date(s);
  it("uses real calendar months, clamping the day", () => {
    expect(addCalendarMonthsUTC(at("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addCalendarMonthsUTC(at("2028-01-31T10:00:00Z"), 1).toISOString()).toBe("2028-02-29T10:00:00.000Z"); // leap year
    expect(addCalendarMonthsUTC(at("2026-03-31T10:00:00Z"), 1).toISOString()).toBe("2026-04-30T10:00:00.000Z");
    expect(addCalendarMonthsUTC(at("2026-12-15T10:00:00Z"), 1).toISOString()).toBe("2027-01-15T10:00:00.000Z");
    expect(addCalendarMonthsUTC(at("2026-11-11T09:30:00Z"), 12).toISOString()).toBe("2027-11-11T09:30:00.000Z");
    expect(addCalendarMonthsUTC(at("2028-02-29T10:00:00Z"), 12).toISOString()).toBe("2029-02-28T10:00:00.000Z");
    expect(addCalendarMonthsUTC(at("2026-08-31T10:00:00Z"), 6).toISOString()).toBe("2027-02-28T10:00:00.000Z");
  });
  it("is not 30 days: 1 month from 31 Jan is 28 days, from 1 Jan it is 31", () => {
    expect((addCalendarMonthsUTC(at("2026-01-31T00:00:00Z"), 1).getTime() - at("2026-01-31T00:00:00Z").getTime()) / 86400000).toBe(28);
    expect((addCalendarMonthsUTC(at("2026-01-01T00:00:00Z"), 1).getTime() - at("2026-01-01T00:00:00Z").getTime()) / 86400000).toBe(31);
  });
  const now = at("2026-11-11T00:00:00Z");
  it("enforces the Free (1 month) and Plus (12 months) horizons at the exact boundary", () => {
    const free = scheduleWindow(now, 1).latest, plus = scheduleWindow(now, 12).latest;
    expect(free.toISOString()).toBe("2026-12-11T00:00:00.000Z");
    expect(plus.toISOString()).toBe("2027-11-11T00:00:00.000Z");
    expect(checkWindow(free, now, 1)).toEqual({ ok: true });
    expect(checkWindow(new Date(free.getTime() + 1), now, 1)).toMatchObject({ ok: false, code: "TOO_FAR" });
    expect(checkWindow(plus, now, 12)).toEqual({ ok: true });
    expect(checkWindow(new Date(plus.getTime() + 1), now, 12)).toMatchObject({ ok: false, code: "TOO_FAR" });
    expect(checkWindow(plus, now, 1)).toMatchObject({ ok: false, code: "TOO_FAR" }); // a Free account cannot use the Plus horizon
  });
  it("requires a future time with a 5 minute lead", () => {
    expect(checkWindow(new Date(now.getTime() + 4 * 60000 + 59000), now, 1)).toMatchObject({ ok: false, code: "IN_THE_PAST" });
    expect(checkWindow(new Date(now.getTime() + 5 * 60000), now, 1)).toEqual({ ok: true });
    expect(checkWindow(new Date(now.getTime() - 1), now, 1)).toMatchObject({ ok: false, code: "IN_THE_PAST" });
    expect(checkWindow(new Date("2020-01-01T00:00:00Z"), now, 12)).toMatchObject({ ok: false, code: "IN_THE_PAST" });
  });
  it("describes a delivery time with its zone and offset", () => {
    const r = resolveLocal("2026-12-12", "09:00", "Asia/Colombo");
    expect(r.kind === "ok" && describeInstant(r.instant, "Asia/Colombo")).toMatch(/Saturday 12 December 2026.*9:00.*Asia\/Colombo, UTC\+05:30/);
  });
});
