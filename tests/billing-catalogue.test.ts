import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ANNUAL_PRICE_MONTHS, CATALOGUE, CURRENCY, EVENT_PACKAGE, PLAN_ENTITLEMENTS, PREMIUM_CARD_PRICE_CENTS, formatAud, getCatalogueEntry } from "@/modules/billing/catalogue";
import { corporateCumulativeAllocation, corporateMonthlyAllocation } from "@/modules/billing/allocation";
import { PREMIUM_TEMPLATE_KEYS, TEMPLATE_KEYS, templateTier } from "@/modules/templates/registry";

afterAll(async () => { await db.$disconnect(); });

describe("approved pricing (AUD cents)", () => {
  const price = (code: string) => getCatalogueEntry(code)!.amountCents;
  it("matches the owner-approved matrix exactly", () => {
    expect(Object.fromEntries(CATALOGUE.map((e) => [e.code, e.amountCents]))).toEqual({
      plus_month: 1_000, plus_year: 6_000,
      corporate_month: 2_000, corporate_year: 12_000,
      unlimited_month: 3_000, unlimited_year: 18_000,
      premium_card: 299, event: 6_000,
    });
    expect(PREMIUM_CARD_PRICE_CENTS).toBe(price("premium_card"));
  });
  it("annual price is 6 × monthly (50% discount) for every tier", () => {
    for (const tier of ["plus", "corporate", "unlimited"]) expect(price(`${tier}_year`)).toBe(price(`${tier}_month`) * ANNUAL_PRICE_MONTHS);
  });
  it("AUD only, integer cents, unique codes and versioned unique lookup keys, one Stripe product per plan", () => {
    expect(CATALOGUE.every((e) => e.currency === CURRENCY && CURRENCY === "aud" && Number.isInteger(e.amountCents) && e.amountCents > 0)).toBe(true);
    expect(new Set(CATALOGUE.map((e) => e.code)).size).toBe(CATALOGUE.length);
    expect(new Set(CATALOGUE.map((e) => e.lookupKey)).size).toBe(CATALOGUE.length);
    expect(CATALOGUE.every((e) => /^mawica_[a-z_]+_aud_v\d+$/.test(e.lookupKey))).toBe(true);
    for (const e of CATALOGUE) {
      if (e.kind === "subscription") { expect(e.interval).not.toBeNull(); expect(e.product).toBe(e.plan); }
      else { expect(e.interval).toBeNull(); expect(e.plan).toBeNull(); }
    }
  });
  it("unknown codes are refused", () => {
    expect(getCatalogueEntry("plus_lifetime")).toBeNull();
    expect(getCatalogueEntry("")).toBeNull();
  });
  it("display formatting is en-AU dollars", () => {
    expect(formatAud(299)).toBe("$2.99");
    expect(formatAud(6_000)).toBe("$60.00");
  });
});

describe("approved entitlements", () => {
  it("Plus premium is within the total; Corporate 100 within 1,000 a year; Unlimited is explicit (null), not a large number", () => {
    expect(PLAN_ENTITLEMENTS.plus).toMatchObject({ sendsTotal: 50, sendsPremium: 5, period: "month" });
    expect(PLAN_ENTITLEMENTS.corporate).toMatchObject({ sendsTotal: 1_000, sendsPremium: 100, period: "year" });
    expect(PLAN_ENTITLEMENTS.unlimited).toMatchObject({ sendsTotal: null, sendsPremium: null });
    expect(PLAN_ENTITLEMENTS.free).toMatchObject({ sendsTotal: 10, sendsPremium: 0, welcomePremium: 1 });
    expect(EVENT_PACKAGE.maxInvitations).toBe(500);
  });
  it("Free and Plus match the seeded Plan / PlanEntitlement rows the wallet engine uses (no parallel entitlement system)", async () => {
    const rows = await db.planEntitlement.findMany({ where: { planKey: { in: ["free", "plus"] } } });
    const v = (plan: string, key: string) => rows.find((r) => r.planKey === plan && r.key === key);
    expect(v("free", "sends.total")).toMatchObject({ value: PLAN_ENTITLEMENTS.free.sendsTotal, period: "MONTH" });
    expect(v("free", "welcome.premium")).toMatchObject({ value: PLAN_ENTITLEMENTS.free.welcomePremium, period: "LIFETIME" });
    expect(v("free", "sends.premium")).toBeUndefined();
    expect(v("plus", "sends.total")).toMatchObject({ value: PLAN_ENTITLEMENTS.plus.sendsTotal, period: "MONTH" });
    expect(v("plus", "sends.premium")).toMatchObject({ value: PLAN_ENTITLEMENTS.plus.sendsPremium, period: "MONTH" });
  });
  it("no plan can be assigned through purchase yet: Plus stays non-purchasable and Corporate/Unlimited rows do not exist", async () => {
    const plans = await db.plan.findMany({ select: { key: true, purchasable: true } });
    expect(plans.find((p) => p.key === "plus")?.purchasable).toBe(false);
    expect(plans.some((p) => p.key === "corporate" || p.key === "unlimited")).toBe(false);
  });
});

describe("Corporate cumulative allocation (approved Q2)", () => {
  it("distributes exactly 1,000 total and 100 premium over 12 paid months with no rounding drift", () => {
    const months = Array.from({ length: 12 }, (_, i) => corporateMonthlyAllocation(i + 1));
    expect(months.map((m) => m.total)).toEqual([83, 83, 84, 83, 83, 84, 83, 83, 84, 83, 83, 84]);
    expect(months.map((m) => m.premium)).toEqual([8, 8, 9, 8, 8, 9, 8, 8, 9, 8, 8, 9]);
    expect(months.reduce((a, m) => a + m.total, 0)).toBe(1_000);
    expect(months.reduce((a, m) => a + m.premium, 0)).toBe(100);
  });
  it("premium never exceeds total, monthly or cumulatively; one payment never unlocks the year", () => {
    for (let k = 0; k <= 12; k++) {
      const c = corporateCumulativeAllocation(k);
      expect(c.premium).toBeLessThanOrEqual(c.total);
      if (k >= 1) expect(corporateMonthlyAllocation(k).premium).toBeLessThanOrEqual(corporateMonthlyAllocation(k).total);
    }
    expect(corporateCumulativeAllocation(1)).toEqual({ total: 83, premium: 8 });
    expect(corporateCumulativeAllocation(12)).toEqual({ total: 1_000, premium: 100 });
  });
  it("refuses months outside 1..12", () => {
    for (const bad of [0, 13, 1.5, -1]) expect(() => corporateMonthlyAllocation(bad)).toThrow(RangeError);
  });
});

describe("card classification (golden: no free card becomes paid)", () => {
  it("the six launch cards, including the 3D/AR snow globe, tree and gift, stay STANDARD (free)", () => {
    expect([...TEMPLATE_KEYS]).toEqual(["snow-globe", "christmas-tree", "special-gift", "warm-wishes", "new-year-2027", "new-year-celebration"]);
    for (const k of TEMPLATE_KEYS) expect(templateTier(k), k).toBe("STANDARD");
  });
  it("Lumi's Wish cards stay PREMIUM, and nothing else is premium", () => {
    expect([...PREMIUM_TEMPLATE_KEYS]).toEqual(["lumis-wish", "lumis-wish-cinema"]);
    for (const k of PREMIUM_TEMPLATE_KEYS) expect(templateTier(k), k).toBe("PREMIUM");
    expect(() => templateTier("unknown-template")).toThrow(); // unknown templates are refused, never silently classified
  });
});
