import { FINANCE_DISCLAIMER, SCENARIO_MULTIPLIERS } from "./defaults";
import type {
  FinanceAssumptions,
  ForecastResult,
  MonthProjection,
  ScenarioId,
} from "./types";

function clampNonNeg(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function clampRate(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Recognise annual list price evenly across 12 months — avoids booking full annual cash in month 0. */
export function monthlyRecognisedFromAnnual(annualPrice: number): number {
  return annualPrice / 12;
}

export function applyScenario(base: FinanceAssumptions, scenario: ScenarioId): FinanceAssumptions {
  const m = SCENARIO_MULTIPLIERS[scenario];
  return {
    ...base,
    scenario,
    growth: {
      freeOrganicGrowth: clampRate(base.growth.freeOrganicGrowth * m.growth),
      freeAbsoluteAcquisitions: clampNonNeg(base.growth.freeAbsoluteAcquisitions * m.acquisitions),
      freeToPlusMonthlyConversion: clampRate(base.growth.freeToPlusMonthlyConversion * m.conversion),
      freeToPlusAnnualConversion: clampRate(base.growth.freeToPlusAnnualConversion * m.conversion),
      corporateMonthlyAcquisitions: clampNonNeg(base.growth.corporateMonthlyAcquisitions * m.acquisitions),
      corporateAnnualAcquisitions: clampNonNeg(base.growth.corporateAnnualAcquisitions * m.acquisitions),
      unlimitedMonthlyAcquisitions: clampNonNeg(base.growth.unlimitedMonthlyAcquisitions * m.acquisitions),
      unlimitedAnnualAcquisitions: clampNonNeg(base.growth.unlimitedAnnualAcquisitions * m.acquisitions),
      eventBookingsMonth0: clampNonNeg(base.growth.eventBookingsMonth0 * m.acquisitions),
      eventBookingGrowth: clampRate(base.growth.eventBookingGrowth * m.eventGrowth),
    },
    churn: {
      plusMonthly: clampRate(base.churn.plusMonthly * m.churn),
      plusAnnual: clampRate(base.churn.plusAnnual * m.churn),
      corporateMonthly: clampRate(base.churn.corporateMonthly * m.churn),
      corporateAnnual: clampRate(base.churn.corporateAnnual * m.churn),
      unlimitedMonthly: clampRate(base.churn.unlimitedMonthly * m.churn),
      unlimitedAnnual: clampRate(base.churn.unlimitedAnnual * m.churn),
      free: clampRate(base.churn.free * m.churn),
    },
  };
}

function monthLabel(index: number, start = new Date()): string {
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Month-by-month cohort simulation.
 * Acquisition and churn are applied separately each month.
 * Annual subscriptions contribute annualPrice/12 to recognised revenue each month.
 */
export function runForecast(raw: FinanceAssumptions): ForecastResult {
  const a = applyScenario(raw, raw.scenario);
  const months: MonthProjection[] = [];

  let free = clampNonNeg(a.starting.freeUsers);
  let plusM = clampNonNeg(a.starting.plusMonthly);
  let plusA = clampNonNeg(a.starting.plusAnnual);
  let corpM = clampNonNeg(a.starting.corporateMonthly);
  let corpA = clampNonNeg(a.starting.corporateAnnual);
  let unlimM = clampNonNeg(a.starting.unlimitedMonthly);
  let unlimA = clampNonNeg(a.starting.unlimitedAnnual);

  for (let i = 0; i < a.horizonMonths; i++) {
    // --- churn (before acquisitions this month) ---
    free = clampNonNeg(free * (1 - a.churn.free));
    plusM = clampNonNeg(plusM * (1 - a.churn.plusMonthly));
    plusA = clampNonNeg(plusA * (1 - a.churn.plusAnnual));
    corpM = clampNonNeg(corpM * (1 - a.churn.corporateMonthly));
    corpA = clampNonNeg(corpA * (1 - a.churn.corporateAnnual));
    unlimM = clampNonNeg(unlimM * (1 - a.churn.unlimitedMonthly));
    unlimA = clampNonNeg(unlimA * (1 - a.churn.unlimitedAnnual));

    // --- conversions from free (counted as acquisitions onto paid; deducted from free) ---
    const toPlusM = free * a.growth.freeToPlusMonthlyConversion;
    const toPlusA = free * a.growth.freeToPlusAnnualConversion;
    free = clampNonNeg(free - toPlusM - toPlusA);
    plusM += toPlusM;
    plusA += toPlusA;

    // --- organic + absolute free acquisition ---
    free += free * a.growth.freeOrganicGrowth + a.growth.freeAbsoluteAcquisitions;

    // --- paid absolute acquisitions (not from free conversion) ---
    corpM += a.growth.corporateMonthlyAcquisitions;
    corpA += a.growth.corporateAnnualAcquisitions;
    unlimM += a.growth.unlimitedMonthlyAcquisitions;
    unlimA += a.growth.unlimitedAnnualAcquisitions;

    const eventBookings = a.growth.eventBookingsMonth0 * Math.pow(1 + a.growth.eventBookingGrowth, i);

    const recurringMrr =
      plusM * a.pricing.plusMonthly +
      plusA * monthlyRecognisedFromAnnual(a.pricing.plusAnnual) +
      corpM * a.pricing.corporateMonthly +
      corpA * monthlyRecognisedFromAnnual(a.pricing.corporateAnnual) +
      unlimM * a.pricing.unlimitedMonthly +
      unlimA * monthlyRecognisedFromAnnual(a.pricing.unlimitedAnnual);

    const eventRevenue = round2(eventBookings * a.pricing.eventBooking);
    const subscriptionRevenue = round2(recurringMrr);
    const grossRevenue = round2(subscriptionRevenue + eventRevenue);

    const activeUsers = free + plusM + plusA + corpM + corpA + unlimM + unlimA;
    const sends = activeUsers * a.opex.sendsPerActiveUser;
    const azureCost = round2(
      a.opex.azureInfrastructureFixed + (activeUsers / 1000) * a.opex.azurePerThousandUsers,
    );
    const aiCost = round2(sends * a.opex.aiPerSend);
    const emailCost = round2(sends * a.opex.emailPerSend);
    const paymentProcessingCost = round2(grossRevenue * a.opex.paymentProcessingRate);
    const otherOpex = round2(a.opex.otherFixedMonthly);
    const totalCosts = round2(azureCost + aiCost + emailCost + paymentProcessingCost + otherOpex);
    const profit = round2(grossRevenue - totalCosts);

    months.push({
      monthIndex: i,
      label: monthLabel(i),
      freeUsers: round2(free),
      plusMonthly: round2(plusM),
      plusAnnual: round2(plusA),
      corporateMonthly: round2(corpM),
      corporateAnnual: round2(corpA),
      unlimitedMonthly: round2(unlimM),
      unlimitedAnnual: round2(unlimA),
      eventBookings: round2(eventBookings),
      subscriptionRevenue,
      eventRevenue,
      grossRevenue,
      paymentProcessingCost,
      azureCost,
      aiCost,
      emailCost,
      otherOpex,
      totalCosts,
      profit,
      recurringMrr: subscriptionRevenue,
    });
  }

  const totals = months.reduce(
    (acc, m) => {
      acc.grossRevenue += m.grossRevenue;
      acc.totalCosts += m.totalCosts;
      acc.profit += m.profit;
      acc.subscriptionRevenue += m.subscriptionRevenue;
      acc.eventRevenue += m.eventRevenue;
      acc.paymentProcessingCost += m.paymentProcessingCost;
      return acc;
    },
    {
      grossRevenue: 0,
      totalCosts: 0,
      profit: 0,
      subscriptionRevenue: 0,
      eventRevenue: 0,
      paymentProcessingCost: 0,
    },
  );

  for (const k of Object.keys(totals) as (keyof typeof totals)[]) {
    totals[k] = round2(totals[k]);
  }

  return {
    assumptions: a,
    scenario: a.scenario,
    months,
    totals,
    currency: "AUD",
    taxTreatment: "Exclusive of GST (planning label — not tax advice)",
    disclaimer: FINANCE_DISCLAIMER,
    formulas: FORMULAS,
  };
}

export const FORMULAS: ForecastResult["formulas"] = [
  {
    id: "annual_recognition",
    title: "Annual subscription recognition",
    body: "Recognised monthly revenue from an annual subscriber = annual_list_price / 12. Cash timing is not modelled; this prevents double-counting the full annual fee as monthly revenue.",
  },
  {
    id: "churn_then_acquire",
    title: "Churn then acquire",
    body: "Each month: ending = (beginning × (1 − churn)) + conversions + absolute acquisitions. Churn and acquisition are separate inputs.",
  },
  {
    id: "conversion",
    title: "Free → Plus conversion",
    body: "Converters = free_users × conversion_rate. They leave the free base and join Plus monthly or annual cohorts.",
  },
  {
    id: "gross_revenue",
    title: "Gross revenue",
    body: "gross = recognised_subscription_MRR + (event_bookings × event_price). Free plan contributes $0.",
  },
  {
    id: "costs",
    title: "Costs",
    body: "total_costs = azure_fixed + azure_per_thousand×users/1000 + ai_per_send×sends + email_per_send×sends + payment_processing_rate×gross + other_fixed. Payment processing is an estimate, not a live Stripe fee.",
  },
  {
    id: "profit",
    title: "Profit",
    body: "profit = gross_revenue − total_costs (projection only).",
  },
];

export function compareScenarios(
  base: FinanceAssumptions,
): Record<ScenarioId, ForecastResult> {
  return {
    conservative: runForecast({ ...base, scenario: "conservative" }),
    base: runForecast({ ...base, scenario: "base" }),
    optimistic: runForecast({ ...base, scenario: "optimistic" }),
  };
}
