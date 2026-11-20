import type { FinanceAssumptions, HorizonMonths, ScenarioId } from "./types";

export const FINANCE_DISCLAIMER =
  "Projected figures only — not actual Mawica revenue, wallet balances, or Stripe settlements. " +
  "Currency: AUD. Tax treatment: exclusive of GST (not tax advice). " +
  "Assumptions are editable planning inputs with explicit provenance; they are not sourced from CreditAccount or LedgerEntry.";

export const BASE_ASSUMPTIONS: Omit<FinanceAssumptions, "horizonMonths" | "scenario"> = {
  currency: "AUD",
  taxTreatment: "exclusive_of_gst",
  provenance:
    "P4A planning defaults (2026-11). Placeholder list prices until commercial packaging is finalised. " +
    "Not derived from production ledger or payment processors.",
  starting: {
    freeUsers: 5_000,
    plusMonthly: 120,
    plusAnnual: 40,
    corporateMonthly: 8,
    corporateAnnual: 4,
    unlimitedMonthly: 15,
    unlimitedAnnual: 5,
  },
  pricing: {
    plusMonthly: 9.99,
    plusAnnual: 99.0,
    eventBooking: 249.0,
    corporateMonthly: 199.0,
    corporateAnnual: 1_990.0,
    unlimitedMonthly: 29.99,
    unlimitedAnnual: 299.0,
  },
  growth: {
    freeOrganicGrowth: 0.04,
    freeAbsoluteAcquisitions: 200,
    freeToPlusMonthlyConversion: 0.008,
    freeToPlusAnnualConversion: 0.002,
    corporateMonthlyAcquisitions: 1,
    corporateAnnualAcquisitions: 0.25,
    unlimitedMonthlyAcquisitions: 2,
    unlimitedAnnualAcquisitions: 0.5,
    eventBookingsMonth0: 6,
    eventBookingGrowth: 0.03,
  },
  churn: {
    plusMonthly: 0.045,
    plusAnnual: 0.02,
    corporateMonthly: 0.02,
    corporateAnnual: 0.01,
    unlimitedMonthly: 0.035,
    unlimitedAnnual: 0.015,
    free: 0.06,
  },
  opex: {
    azureInfrastructureFixed: 450,
    azurePerThousandUsers: 35,
    aiPerSend: 0.02,
    sendsPerActiveUser: 1.2,
    emailPerSend: 0.001,
    paymentProcessingRate: 0.029,
    otherFixedMonthly: 800,
  },
};

/** Scenario multipliers applied to Base growth/churn/opex-sensitive rates. */
export const SCENARIO_MULTIPLIERS: Record<
  ScenarioId,
  {
    label: string;
    description: string;
    growth: number;
    conversion: number;
    churn: number;
    eventGrowth: number;
    acquisitions: number;
  }
> = {
  conservative: {
    label: "Conservative",
    description: "Slower acquisition, weaker conversion, higher churn.",
    growth: 0.7,
    conversion: 0.7,
    churn: 1.35,
    eventGrowth: 0.6,
    acquisitions: 0.7,
  },
  base: {
    label: "Base",
    description: "Planning defaults as authored.",
    growth: 1,
    conversion: 1,
    churn: 1,
    eventGrowth: 1,
    acquisitions: 1,
  },
  optimistic: {
    label: "Optimistic",
    description: "Faster growth, stronger conversion, lower churn.",
    growth: 1.35,
    conversion: 1.4,
    churn: 0.75,
    eventGrowth: 1.4,
    acquisitions: 1.35,
  },
};

export function buildAssumptions(opts: {
  horizonMonths: HorizonMonths;
  scenario: ScenarioId;
  overrides?: Partial<FinanceAssumptions>;
}): FinanceAssumptions {
  const base: FinanceAssumptions = {
    ...BASE_ASSUMPTIONS,
    starting: { ...BASE_ASSUMPTIONS.starting },
    pricing: { ...BASE_ASSUMPTIONS.pricing },
    growth: { ...BASE_ASSUMPTIONS.growth },
    churn: { ...BASE_ASSUMPTIONS.churn },
    opex: { ...BASE_ASSUMPTIONS.opex },
    horizonMonths: opts.horizonMonths,
    scenario: opts.scenario,
  };

  const o = opts.overrides;
  if (!o) return base;

  return {
    ...base,
    ...o,
    starting: { ...base.starting, ...o.starting },
    pricing: { ...base.pricing, ...o.pricing },
    growth: { ...base.growth, ...o.growth },
    churn: { ...base.churn, ...o.churn },
    opex: { ...base.opex, ...o.opex },
    horizonMonths: o.horizonMonths ?? opts.horizonMonths,
    scenario: o.scenario ?? opts.scenario,
  };
}
