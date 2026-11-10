import "server-only";
import type { Prisma } from "@/generated/prisma/client";

type Reader = Pick<Prisma.TransactionClient, "plan">;

export const ENTITLEMENT_KEYS = { sendsTotal: "sends.total", sendsPremium: "sends.premium", welcomePremium: "welcome.premium", scheduleMonthsAhead: "schedule.months_ahead" } as const;

/** Plan entitlements read from the database (plans are data). NULL values mean "unlimited, fair use": reserved for future plans. */
export type Entitlements = {
  planKey: string;
  name: string;
  purchasable: boolean;
  /** Total sends per period. */
  sendsTotal: number;
  /** Premium sends per period (0 when the plan has none). */
  sendsPremium: number;
  /** One-time premium credit given to a new account (lifetime, never regenerates). */
  welcomePremium: number;
  /** Scheduling horizon in calendar months (used by the scheduling phase). */
  scheduleMonthsAhead: number | null;
  /** Months per allowance period for the plan's per-period entitlements. */
  periodMonths: number;
};

export class UnsupportedPlanError extends Error {}

export async function loadEntitlements(db: Reader, planKey: string): Promise<Entitlements> {
  const plan = await db.plan.findUnique({ where: { key: planKey }, include: { entitlements: true } });
  if (!plan || !plan.active) throw new UnsupportedPlanError(`Unknown or inactive plan: ${planKey}`);
  const get = (key: string) => plan.entitlements.find((e) => e.key === key);
  const total = get(ENTITLEMENT_KEYS.sendsTotal);
  // Unlimited plans (Unlimited, Corporate yearly pools, Events) are a later phase: refuse rather than guess.
  if (!total || total.value === null) throw new UnsupportedPlanError(`Plan ${planKey} has no finite per-period send allowance (not supported yet)`);
  const periodMonths = total.period === "MONTH" ? 1 : total.period === "SUBSCRIPTION_YEAR" ? 12 : 0;
  if (!periodMonths) throw new UnsupportedPlanError(`Plan ${planKey}: period ${total.period} is not supported for sends yet`);
  return {
    planKey: plan.key,
    name: plan.name,
    purchasable: plan.purchasable,
    sendsTotal: total.value,
    sendsPremium: get(ENTITLEMENT_KEYS.sendsPremium)?.value ?? 0,
    welcomePremium: get(ENTITLEMENT_KEYS.welcomePremium)?.value ?? 0,
    scheduleMonthsAhead: get(ENTITLEMENT_KEYS.scheduleMonthsAhead)?.value ?? null,
    periodMonths,
  };
}
