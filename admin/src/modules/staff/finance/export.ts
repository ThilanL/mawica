import "server-only";
import { assertPermission, type StaffRoleName } from "../roles";
import { recordStaffAudit } from "../audit";
import { runForecast } from "./forecast";
import type { FinanceAssumptions } from "./types";

/** Same formula-injection defence as ops CSV. */
export function csvCell(v: string): string {
  let out = v;
  if (/^[=+\-@\t\r]/.test(out)) out = `'${out}`;
  if (/[",\n\r]/.test(out)) return `"${out.replace(/"/g, '""')}"`;
  return out;
}

export async function buildFinanceProjectionCsv(
  assumptions: FinanceAssumptions,
  opts: {
    role: StaffRoleName;
    staffPrincipalId: string;
    rateLimitSalt: string;
    ip?: string | null;
  },
): Promise<{ filename: string; body: string }> {
  assertPermission(opts.role, "finance:plan");
  const forecast = runForecast(assumptions);

  const header = [
    "month",
    "label",
    "gross_revenue_aud",
    "subscription_revenue_aud",
    "event_revenue_aud",
    "recurring_mrr_aud",
    "total_costs_aud",
    "payment_processing_aud",
    "azure_aud",
    "ai_aud",
    "email_aud",
    "other_opex_aud",
    "profit_aud",
    "free_users",
    "plus_monthly",
    "plus_annual",
    "corporate_monthly",
    "corporate_annual",
    "unlimited_monthly",
    "unlimited_annual",
    "event_bookings",
    "scenario",
    "currency",
    "tax_treatment",
    "note",
  ].join(",");

  const rows = forecast.months.map((m) =>
    [
      String(m.monthIndex + 1),
      m.label,
      String(m.grossRevenue),
      String(m.subscriptionRevenue),
      String(m.eventRevenue),
      String(m.recurringMrr),
      String(m.totalCosts),
      String(m.paymentProcessingCost),
      String(m.azureCost),
      String(m.aiCost),
      String(m.emailCost),
      String(m.otherOpex),
      String(m.profit),
      String(m.freeUsers),
      String(m.plusMonthly),
      String(m.plusAnnual),
      String(m.corporateMonthly),
      String(m.corporateAnnual),
      String(m.unlimitedMonthly),
      String(m.unlimitedAnnual),
      String(m.eventBookings),
      forecast.scenario,
      "AUD",
      "exclusive_of_gst",
      "projection_only_not_actual_revenue",
    ]
      .map(csvCell)
      .join(","),
  );

  await recordStaffAudit("finance.projection_exported", {
    staffPrincipalId: opts.staffPrincipalId,
    rateLimitSalt: opts.rateLimitSalt,
    ip: opts.ip,
    bestEffort: true,
    meta: {
      scenario: assumptions.scenario,
      horizonMonths: assumptions.horizonMonths,
    },
  });

  const body = [header, ...rows].join("\n") + "\n";
  const filename = `mawica-finance-projection-${assumptions.scenario}-${assumptions.horizonMonths}m-${Date.now()}.csv`;
  return { filename, body };
}
