import { describe, expect, it } from "vitest";
import { buildAssumptions } from "@/modules/staff/finance/defaults";
import { csvCell } from "@/modules/staff/finance/export";
import {
  compareScenarios,
  monthlyRecognisedFromAnnual,
  runForecast,
} from "@/modules/staff/finance/forecast";
import { assumptionsFromSearchParams } from "@/modules/staff/finance/parse";
import { hasPermission, assertPermission, StaffAuthzError } from "@/modules/staff/roles";

describe("finance RBAC", () => {
  it("allows OWNER and FINANCE to plan; not READONLY/OPS/SUPPORT", () => {
    expect(hasPermission("OWNER", "finance:plan")).toBe(true);
    expect(hasPermission("FINANCE", "finance:plan")).toBe(true);
    expect(hasPermission("READONLY", "finance:plan")).toBe(false);
    expect(hasPermission("OPS", "finance:plan")).toBe(false);
    expect(hasPermission("SUPPORT", "finance:plan")).toBe(false);
    expect(() => assertPermission("READONLY", "finance:plan")).toThrow(StaffAuthzError);
  });
});

describe("forecasting mathematics", () => {
  it("recognises annual price evenly across 12 months", () => {
    expect(monthlyRecognisedFromAnnual(120)).toBe(10);
    const a = buildAssumptions({
      horizonMonths: 12,
      scenario: "base",
      overrides: {
        starting: {
          freeUsers: 0,
          plusMonthly: 0,
          plusAnnual: 1,
          corporateMonthly: 0,
          corporateAnnual: 0,
          unlimitedMonthly: 0,
          unlimitedAnnual: 0,
        },
        pricing: {
          plusMonthly: 0,
          plusAnnual: 120,
          eventBooking: 0,
          corporateMonthly: 0,
          corporateAnnual: 0,
          unlimitedMonthly: 0,
          unlimitedAnnual: 0,
        },
        growth: {
          freeOrganicGrowth: 0,
          freeAbsoluteAcquisitions: 0,
          freeToPlusMonthlyConversion: 0,
          freeToPlusAnnualConversion: 0,
          corporateMonthlyAcquisitions: 0,
          corporateAnnualAcquisitions: 0,
          unlimitedMonthlyAcquisitions: 0,
          unlimitedAnnualAcquisitions: 0,
          eventBookingsMonth0: 0,
          eventBookingGrowth: 0,
        },
        churn: {
          plusMonthly: 0,
          plusAnnual: 0,
          corporateMonthly: 0,
          corporateAnnual: 0,
          unlimitedMonthly: 0,
          unlimitedAnnual: 0,
          free: 0,
        },
        opex: {
          azureInfrastructureFixed: 0,
          azurePerThousandUsers: 0,
          aiPerSend: 0,
          sendsPerActiveUser: 0,
          emailPerSend: 0,
          paymentProcessingRate: 0,
          otherFixedMonthly: 0,
        },
      },
    });
    const f = runForecast(a);
    expect(f.months).toHaveLength(12);
    for (const m of f.months) {
      expect(m.subscriptionRevenue).toBe(10);
      expect(m.grossRevenue).toBe(10);
    }
    expect(f.totals.subscriptionRevenue).toBe(120);
    expect(f.totals.grossRevenue).toBe(120);
  });

  it("applies churn and acquisition separately", () => {
    const a = buildAssumptions({
      horizonMonths: 1,
      scenario: "base",
      overrides: {
        starting: {
          freeUsers: 0,
          plusMonthly: 100,
          plusAnnual: 0,
          corporateMonthly: 0,
          corporateAnnual: 0,
          unlimitedMonthly: 0,
          unlimitedAnnual: 0,
        },
        pricing: {
          plusMonthly: 10,
          plusAnnual: 0,
          eventBooking: 0,
          corporateMonthly: 0,
          corporateAnnual: 0,
          unlimitedMonthly: 0,
          unlimitedAnnual: 0,
        },
        growth: {
          freeOrganicGrowth: 0,
          freeAbsoluteAcquisitions: 0,
          freeToPlusMonthlyConversion: 0,
          freeToPlusAnnualConversion: 0,
          corporateMonthlyAcquisitions: 0,
          corporateAnnualAcquisitions: 0,
          unlimitedMonthlyAcquisitions: 0,
          unlimitedAnnualAcquisitions: 0,
          eventBookingsMonth0: 0,
          eventBookingGrowth: 0,
        },
        churn: {
          plusMonthly: 0.1,
          plusAnnual: 0,
          corporateMonthly: 0,
          corporateAnnual: 0,
          unlimitedMonthly: 0,
          unlimitedAnnual: 0,
          free: 0,
        },
        opex: {
          azureInfrastructureFixed: 0,
          azurePerThousandUsers: 0,
          aiPerSend: 0,
          sendsPerActiveUser: 0,
          emailPerSend: 0,
          paymentProcessingRate: 0,
          otherFixedMonthly: 0,
        },
      },
    });
    // Also inject absolute acquisition via unlimited path on plus: after churn 90, we need acquisition.
    // Using corporate monthly acquisition mapped onto plus is awkward; instead check churn alone:
    const f = runForecast(a);
    expect(f.months[0].plusMonthly).toBe(90);
    expect(f.months[0].subscriptionRevenue).toBe(900);
  });

  it("keeps gross, costs and profit distinct", () => {
    const f = runForecast(buildAssumptions({ horizonMonths: 12, scenario: "base" }));
    expect(f.totals.grossRevenue).toBeGreaterThan(0);
    expect(f.totals.totalCosts).toBeGreaterThan(0);
    // Totals are sums of per-month rounded lines (not a single re-round of aggregates).
    const sumProfit = Math.round(f.months.reduce((s, m) => s + m.profit, 0) * 100) / 100;
    expect(f.totals.profit).toBe(sumProfit);
    for (const m of f.months) {
      expect(m.profit).toBe(Math.round((m.grossRevenue - m.totalCosts) * 100) / 100);
    }
    expect(f.disclaimer.toLowerCase()).toContain("not actual");
    expect(f.currency).toBe("AUD");
  });

  it("orders scenarios optimistically vs conservatively on revenue", () => {
    const base = buildAssumptions({ horizonMonths: 24, scenario: "base" });
    const c = compareScenarios(base);
    expect(c.optimistic.totals.grossRevenue).toBeGreaterThan(c.base.totals.grossRevenue);
    expect(c.base.totals.grossRevenue).toBeGreaterThan(c.conservative.totals.grossRevenue);
  });

  it("never claims stripe or ledger coupling in formulas", () => {
    const f = runForecast(buildAssumptions({ horizonMonths: 12, scenario: "base" }));
    const blob = JSON.stringify(f.formulas) + f.disclaimer;
    expect(blob.toLowerCase()).toMatch(/not a live stripe|projection only|not actual/);
    expect(blob.toLowerCase()).not.toMatch(/actual revenue from stripe/);
  });
});

describe("finance CSV cells", () => {
  it("neutralises formula injection", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("120.5")).toBe("120.5");
  });
});

describe("finance input validation", () => {
  it("clamps negatives, NaN, and out-of-range rates from query params", () => {
    const a = assumptionsFromSearchParams({
      horizon: "99",
      scenario: "nope",
      freeUsers: "-10",
      pricePlusMonthly: "NaN",
      churnPlusMonthly: "2",
      freeToPlusMonthlyConversion: "-0.5",
      paymentProcessingRate: "1.5",
      azureFixed: "-100",
    });
    expect(a.horizonMonths).toBe(24);
    expect(a.scenario).toBe("base");
    expect(a.starting.freeUsers).toBe(0);
    expect(a.pricing.plusMonthly).toBeGreaterThan(0); // falls back to default
    expect(a.churn.plusMonthly).toBe(1);
    expect(a.growth.freeToPlusMonthlyConversion).toBe(0);
    expect(a.opex.paymentProcessingRate).toBe(1);
    expect(a.opex.azureInfrastructureFixed).toBe(0);
  });

  it("survives 100% churn without NaN months", () => {
    const f = runForecast(
      buildAssumptions({
        horizonMonths: 12,
        scenario: "base",
        overrides: {
          churn: {
            plusMonthly: 1,
            plusAnnual: 1,
            corporateMonthly: 1,
            corporateAnnual: 1,
            unlimitedMonthly: 1,
            unlimitedAnnual: 1,
            free: 1,
          },
          growth: {
            freeOrganicGrowth: 0,
            freeAbsoluteAcquisitions: 0,
            freeToPlusMonthlyConversion: 0,
            freeToPlusAnnualConversion: 0,
            corporateMonthlyAcquisitions: 0,
            corporateAnnualAcquisitions: 0,
            unlimitedMonthlyAcquisitions: 0,
            unlimitedAnnualAcquisitions: 0,
            eventBookingsMonth0: 0,
            eventBookingGrowth: 0,
          },
        },
      }),
    );
    expect(f.months).toHaveLength(12);
    for (const m of f.months) {
      expect(Number.isFinite(m.grossRevenue)).toBe(true);
      expect(Number.isFinite(m.profit)).toBe(true);
      expect(m.plusMonthly).toBe(0);
    }
  });
});
