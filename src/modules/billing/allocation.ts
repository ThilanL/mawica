/**
 * Corporate progressive allocation (approved, STRIPE-PHASE-1B-DECISIONS.md revision 3, Q1/Q2). Pure integer arithmetic.
 *
 * A monthly Corporate subscriber receives, for the k-th SUCCESSFULLY PAID month (k = 1..12) of a subscription year:
 *   total_k   = floor(1000·k/12) − floor(1000·(k−1)/12)   → 83, 83, 84, … (12 months sum to exactly 1,000)
 *   premium_k = floor(100·k/12)  − floor(100·(k−1)/12)    → 8, 8, 9, …    (12 months sum to exactly 100)
 * Premium is WITHIN the total. One payment never unlocks the whole year. Annual subscribers receive the full year at once.
 * Not wired into the wallet engine yet: Corporate is not purchasable until its phase is implemented and approved.
 */
export const CORPORATE_YEAR_TOTAL = 1_000;
export const CORPORATE_YEAR_PREMIUM = 100;
export const MONTHS_PER_YEAR = 12;

function cumulative(yearAmount: number, paidMonths: number): number {
  return Math.floor((yearAmount * paidMonths) / MONTHS_PER_YEAR);
}

export type MonthlyAllocation = { month: number; total: number; premium: number };

/** Allocation for the k-th paid month of a subscription year (1-based). Throws for anything outside 1..12. */
export function corporateMonthlyAllocation(month: number): MonthlyAllocation {
  if (!Number.isInteger(month) || month < 1 || month > MONTHS_PER_YEAR) throw new RangeError("month must be an integer from 1 to 12");
  return {
    month,
    total: cumulative(CORPORATE_YEAR_TOTAL, month) - cumulative(CORPORATE_YEAR_TOTAL, month - 1),
    premium: cumulative(CORPORATE_YEAR_PREMIUM, month) - cumulative(CORPORATE_YEAR_PREMIUM, month - 1),
  };
}

/** What a monthly subscriber has been allocated in total after `paidMonths` paid months of the current subscription year. */
export function corporateCumulativeAllocation(paidMonths: number): { total: number; premium: number } {
  if (!Number.isInteger(paidMonths) || paidMonths < 0 || paidMonths > MONTHS_PER_YEAR) throw new RangeError("paidMonths must be an integer from 0 to 12");
  return { total: cumulative(CORPORATE_YEAR_TOTAL, paidMonths), premium: cumulative(CORPORATE_YEAR_PREMIUM, paidMonths) };
}
