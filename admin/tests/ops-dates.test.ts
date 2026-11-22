import { describe, expect, it } from "vitest";
import {
  enumerateUtcDays,
  inHalfOpenRange,
  OpsDateRangeError,
  resolveOpsDateRange,
} from "@/modules/staff/ops/dates";

describe("ops date ranges", () => {
  const now = new Date("2026-11-21T15:00:00.000Z");

  it("resolves 7d / 30d / 90d as half-open ending at now", () => {
    const d7 = resolveOpsDateRange({ preset: "7d" }, now);
    expect(d7.toExclusive.toISOString()).toBe(now.toISOString());
    expect(d7.from.toISOString()).toBe("2026-11-14T15:00:00.000Z");

    const d30 = resolveOpsDateRange({ preset: "30d" }, now);
    expect(d30.from.toISOString()).toBe("2026-10-22T15:00:00.000Z");

    const d90 = resolveOpsDateRange({ preset: "90d" }, now);
    expect(d90.from.toISOString()).toBe("2026-08-23T15:00:00.000Z");
  });

  it("treats custom to as inclusive UTC calendar day", () => {
    const r = resolveOpsDateRange({ preset: "custom", from: "2026-11-01", to: "2026-11-03" }, now);
    expect(r.from.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(r.toExclusive.toISOString()).toBe("2026-11-04T00:00:00.000Z");
    expect(enumerateUtcDays(r.from, r.toExclusive)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });

  it("rejects inverted and oversized custom ranges", () => {
    expect(() => resolveOpsDateRange({ preset: "custom", from: "2026-11-10", to: "2026-11-01" })).toThrow(
      OpsDateRangeError,
    );
    expect(() => resolveOpsDateRange({ preset: "custom", from: "2025-01-01", to: "2026-12-31" })).toThrow(
      OpsDateRangeError,
    );
  });

  it("uses half-open membership for boundaries", () => {
    const r = resolveOpsDateRange({ preset: "custom", from: "2026-11-01", to: "2026-11-01" }, now);
    expect(inHalfOpenRange(new Date("2026-11-01T00:00:00.000Z"), r.from, r.toExclusive)).toBe(true);
    expect(inHalfOpenRange(new Date("2026-11-01T23:59:59.999Z"), r.from, r.toExclusive)).toBe(true);
    expect(inHalfOpenRange(new Date("2026-11-02T00:00:00.000Z"), r.from, r.toExclusive)).toBe(false);
  });
});
