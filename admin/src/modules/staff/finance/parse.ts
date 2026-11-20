import { buildAssumptions } from "./defaults";
import type { FinanceAssumptions, HorizonMonths, ScenarioId } from "./types";

function num(raw: string | null | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Counts and money: finite and ≥ 0. */
function nonNeg(raw: string | null | undefined, fallback: number): number {
  return Math.max(0, num(raw, fallback));
}

/** Rates expected as fractions: finite and clamped to [0, 1]. */
function rate01(raw: string | null | undefined, fallback: number): number {
  const n = num(raw, fallback);
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function horizon(raw: string | null | undefined): HorizonMonths {
  if (raw === "12" || raw === "24" || raw === "36") return Number(raw) as HorizonMonths;
  return 24;
}

function scenario(raw: string | null | undefined): ScenarioId {
  if (raw === "conservative" || raw === "optimistic" || raw === "base") return raw;
  return "base";
}

/** Parse editable assumption overrides from URL/search params or form fields. */
export function assumptionsFromSearchParams(sp: URLSearchParams | Record<string, string | undefined>): FinanceAssumptions {
  const get = (k: string) => {
    if (sp instanceof URLSearchParams) return sp.get(k);
    return sp[k];
  };

  const h = horizon(get("horizon"));
  const s = scenario(get("scenario"));
  const base = buildAssumptions({ horizonMonths: h, scenario: s });

  return buildAssumptions({
    horizonMonths: h,
    scenario: s,
    overrides: {
      starting: {
        freeUsers: nonNeg(get("freeUsers"), base.starting.freeUsers),
        plusMonthly: nonNeg(get("plusMonthly"), base.starting.plusMonthly),
        plusAnnual: nonNeg(get("plusAnnual"), base.starting.plusAnnual),
        corporateMonthly: nonNeg(get("corporateMonthly"), base.starting.corporateMonthly),
        corporateAnnual: nonNeg(get("corporateAnnual"), base.starting.corporateAnnual),
        unlimitedMonthly: nonNeg(get("unlimitedMonthly"), base.starting.unlimitedMonthly),
        unlimitedAnnual: nonNeg(get("unlimitedAnnual"), base.starting.unlimitedAnnual),
      },
      pricing: {
        plusMonthly: nonNeg(get("pricePlusMonthly"), base.pricing.plusMonthly),
        plusAnnual: nonNeg(get("pricePlusAnnual"), base.pricing.plusAnnual),
        eventBooking: nonNeg(get("priceEvent"), base.pricing.eventBooking),
        corporateMonthly: nonNeg(get("priceCorporateMonthly"), base.pricing.corporateMonthly),
        corporateAnnual: nonNeg(get("priceCorporateAnnual"), base.pricing.corporateAnnual),
        unlimitedMonthly: nonNeg(get("priceUnlimitedMonthly"), base.pricing.unlimitedMonthly),
        unlimitedAnnual: nonNeg(get("priceUnlimitedAnnual"), base.pricing.unlimitedAnnual),
      },
      growth: {
        freeOrganicGrowth: rate01(get("freeOrganicGrowth"), base.growth.freeOrganicGrowth),
        freeAbsoluteAcquisitions: nonNeg(get("freeAbsoluteAcquisitions"), base.growth.freeAbsoluteAcquisitions),
        freeToPlusMonthlyConversion: rate01(get("freeToPlusMonthlyConversion"), base.growth.freeToPlusMonthlyConversion),
        freeToPlusAnnualConversion: rate01(get("freeToPlusAnnualConversion"), base.growth.freeToPlusAnnualConversion),
        corporateMonthlyAcquisitions: nonNeg(get("corporateMonthlyAcquisitions"), base.growth.corporateMonthlyAcquisitions),
        corporateAnnualAcquisitions: nonNeg(get("corporateAnnualAcquisitions"), base.growth.corporateAnnualAcquisitions),
        unlimitedMonthlyAcquisitions: nonNeg(get("unlimitedMonthlyAcquisitions"), base.growth.unlimitedMonthlyAcquisitions),
        unlimitedAnnualAcquisitions: nonNeg(get("unlimitedAnnualAcquisitions"), base.growth.unlimitedAnnualAcquisitions),
        eventBookingsMonth0: nonNeg(get("eventBookingsMonth0"), base.growth.eventBookingsMonth0),
        eventBookingGrowth: rate01(get("eventBookingGrowth"), base.growth.eventBookingGrowth),
      },
      churn: {
        plusMonthly: rate01(get("churnPlusMonthly"), base.churn.plusMonthly),
        plusAnnual: rate01(get("churnPlusAnnual"), base.churn.plusAnnual),
        corporateMonthly: rate01(get("churnCorporateMonthly"), base.churn.corporateMonthly),
        corporateAnnual: rate01(get("churnCorporateAnnual"), base.churn.corporateAnnual),
        unlimitedMonthly: rate01(get("churnUnlimitedMonthly"), base.churn.unlimitedMonthly),
        unlimitedAnnual: rate01(get("churnUnlimitedAnnual"), base.churn.unlimitedAnnual),
        free: rate01(get("churnFree"), base.churn.free),
      },
      opex: {
        azureInfrastructureFixed: nonNeg(get("azureFixed"), base.opex.azureInfrastructureFixed),
        azurePerThousandUsers: nonNeg(get("azurePerThousand"), base.opex.azurePerThousandUsers),
        aiPerSend: nonNeg(get("aiPerSend"), base.opex.aiPerSend),
        sendsPerActiveUser: nonNeg(get("sendsPerActiveUser"), base.opex.sendsPerActiveUser),
        emailPerSend: nonNeg(get("emailPerSend"), base.opex.emailPerSend),
        paymentProcessingRate: rate01(get("paymentProcessingRate"), base.opex.paymentProcessingRate),
        otherFixedMonthly: nonNeg(get("otherFixed"), base.opex.otherFixedMonthly),
      },
    },
  });
}

export function assumptionsToQuery(a: FinanceAssumptions): string {
  const p = new URLSearchParams();
  p.set("horizon", String(a.horizonMonths));
  p.set("scenario", a.scenario);
  p.set("freeUsers", String(a.starting.freeUsers));
  p.set("plusMonthly", String(a.starting.plusMonthly));
  p.set("plusAnnual", String(a.starting.plusAnnual));
  p.set("corporateMonthly", String(a.starting.corporateMonthly));
  p.set("corporateAnnual", String(a.starting.corporateAnnual));
  p.set("unlimitedMonthly", String(a.starting.unlimitedMonthly));
  p.set("unlimitedAnnual", String(a.starting.unlimitedAnnual));
  p.set("pricePlusMonthly", String(a.pricing.plusMonthly));
  p.set("pricePlusAnnual", String(a.pricing.plusAnnual));
  p.set("priceEvent", String(a.pricing.eventBooking));
  p.set("priceCorporateMonthly", String(a.pricing.corporateMonthly));
  p.set("priceCorporateAnnual", String(a.pricing.corporateAnnual));
  p.set("priceUnlimitedMonthly", String(a.pricing.unlimitedMonthly));
  p.set("priceUnlimitedAnnual", String(a.pricing.unlimitedAnnual));
  p.set("freeOrganicGrowth", String(a.growth.freeOrganicGrowth));
  p.set("freeAbsoluteAcquisitions", String(a.growth.freeAbsoluteAcquisitions));
  p.set("freeToPlusMonthlyConversion", String(a.growth.freeToPlusMonthlyConversion));
  p.set("freeToPlusAnnualConversion", String(a.growth.freeToPlusAnnualConversion));
  p.set("corporateMonthlyAcquisitions", String(a.growth.corporateMonthlyAcquisitions));
  p.set("corporateAnnualAcquisitions", String(a.growth.corporateAnnualAcquisitions));
  p.set("unlimitedMonthlyAcquisitions", String(a.growth.unlimitedMonthlyAcquisitions));
  p.set("unlimitedAnnualAcquisitions", String(a.growth.unlimitedAnnualAcquisitions));
  p.set("eventBookingsMonth0", String(a.growth.eventBookingsMonth0));
  p.set("eventBookingGrowth", String(a.growth.eventBookingGrowth));
  p.set("churnPlusMonthly", String(a.churn.plusMonthly));
  p.set("churnPlusAnnual", String(a.churn.plusAnnual));
  p.set("churnCorporateMonthly", String(a.churn.corporateMonthly));
  p.set("churnCorporateAnnual", String(a.churn.corporateAnnual));
  p.set("churnUnlimitedMonthly", String(a.churn.unlimitedMonthly));
  p.set("churnUnlimitedAnnual", String(a.churn.unlimitedAnnual));
  p.set("churnFree", String(a.churn.free));
  p.set("azureFixed", String(a.opex.azureInfrastructureFixed));
  p.set("azurePerThousand", String(a.opex.azurePerThousandUsers));
  p.set("aiPerSend", String(a.opex.aiPerSend));
  p.set("sendsPerActiveUser", String(a.opex.sendsPerActiveUser));
  p.set("emailPerSend", String(a.opex.emailPerSend));
  p.set("paymentProcessingRate", String(a.opex.paymentProcessingRate));
  p.set("otherFixed", String(a.opex.otherFixedMonthly));
  return p.toString();
}
