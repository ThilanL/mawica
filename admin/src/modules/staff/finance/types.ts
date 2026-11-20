/**
 * Financial planning types — projections only.
 * Never sourced from CreditAccount / LedgerEntry / Stripe.
 */

export type PlanKey = "free" | "plus" | "event" | "corporate" | "unlimited";
export type ScenarioId = "conservative" | "base" | "optimistic";
export type HorizonMonths = 12 | 24 | 36;

export type FinanceAssumptions = {
  /** ISO 4217. Projections are nominal (no inflation) unless noted. */
  currency: "AUD";
  /**
   * Tax treatment label — amounts are exclusive of GST unless a field says otherwise.
   * Not tax advice; for planning comparison only.
   */
  taxTreatment: "exclusive_of_gst";
  provenance: string;
  horizonMonths: HorizonMonths;
  scenario: ScenarioId;

  /** Starting subscriber / user counts (planning inputs — not live wallet counts). */
  starting: {
    freeUsers: number;
    plusMonthly: number;
    plusAnnual: number;
    corporateMonthly: number;
    corporateAnnual: number;
    unlimitedMonthly: number;
    unlimitedAnnual: number;
  };

  /** List prices (AUD, exclusive of GST). Free is always 0. */
  pricing: {
    plusMonthly: number;
    plusAnnual: number;
    eventBooking: number;
    corporateMonthly: number;
    corporateAnnual: number;
    unlimitedMonthly: number;
    unlimitedAnnual: number;
  };

  /**
   * Growth / funnel rates are monthly fractions (0.02 = 2%/month).
   * Acquisition and churn are modelled separately.
   */
  growth: {
    /** New free users each month as a fraction of current free base. */
    freeOrganicGrowth: number;
    /** Absolute new free users each month (in addition to organic). */
    freeAbsoluteAcquisitions: number;
    /** Fraction of free users converting to Plus monthly each month. */
    freeToPlusMonthlyConversion: number;
    /** Fraction of free users converting to Plus annual each month. */
    freeToPlusAnnualConversion: number;
    /** New corporate monthly accounts per month (absolute). */
    corporateMonthlyAcquisitions: number;
    corporateAnnualAcquisitions: number;
    unlimitedMonthlyAcquisitions: number;
    unlimitedAnnualAcquisitions: number;
    /** Event bookings this month (absolute); grows with eventBookingGrowth. */
    eventBookingsMonth0: number;
    eventBookingGrowth: number;
  };

  churn: {
    plusMonthly: number;
    plusAnnual: number;
    corporateMonthly: number;
    corporateAnnual: number;
    unlimitedMonthly: number;
    unlimitedAnnual: number;
    /** Free attrition (users leaving without converting). */
    free: number;
  };

  /** Operating expense assumptions (AUD / month unless noted). */
  opex: {
    azureInfrastructureFixed: number;
    /** Extra Azure AUD per 1,000 active free+paid users. */
    azurePerThousandUsers: number;
    /** AI generation AUD per projected card send. */
    aiPerSend: number;
    /** Estimated sends per active user per month (planning). */
    sendsPerActiveUser: number;
    emailPerSend: number;
    /** Payment-processing estimate as fraction of gross revenue (not a live Stripe fee). */
    paymentProcessingRate: number;
    otherFixedMonthly: number;
  };
};

export type MonthProjection = {
  monthIndex: number;
  label: string;
  freeUsers: number;
  plusMonthly: number;
  plusAnnual: number;
  corporateMonthly: number;
  corporateAnnual: number;
  unlimitedMonthly: number;
  unlimitedAnnual: number;
  eventBookings: number;
  /** Recognised subscription revenue this month (annual plans = annualPrice/12). */
  subscriptionRevenue: number;
  eventRevenue: number;
  grossRevenue: number;
  paymentProcessingCost: number;
  azureCost: number;
  aiCost: number;
  emailCost: number;
  otherOpex: number;
  totalCosts: number;
  /** grossRevenue − totalCosts */
  profit: number;
  /** Recurring recognised MRR (subscriptions only; excludes event). */
  recurringMrr: number;
};

export type ForecastResult = {
  assumptions: FinanceAssumptions;
  scenario: ScenarioId;
  months: MonthProjection[];
  totals: {
    grossRevenue: number;
    totalCosts: number;
    profit: number;
    subscriptionRevenue: number;
    eventRevenue: number;
    paymentProcessingCost: number;
  };
  formulas: { id: string; title: string; body: string }[];
  currency: "AUD";
  taxTreatment: string;
  disclaimer: string;
};
