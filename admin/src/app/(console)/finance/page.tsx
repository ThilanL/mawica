import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AssumptionsForm } from "@/components/finance/AssumptionsForm";
import { ProjectionChart } from "@/components/finance/ProjectionChart";
import { requestIp } from "@/lib/client-ip";
import { env } from "@/lib/env";
import { readStaffSession } from "@/lib/session";
import { recordStaffAudit } from "@/modules/staff/audit";
import { SCENARIO_MULTIPLIERS } from "@/modules/staff/finance/defaults";
import { compareScenarios, runForecast } from "@/modules/staff/finance/forecast";
import { assumptionsFromSearchParams, assumptionsToQuery } from "@/modules/staff/finance/parse";
import { hasPermission } from "@/modules/staff/roles";

function aud(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
}

export default async function FinancePlanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await readStaffSession();
  if (!session) redirect("/sign-in");
  if (!hasPermission(session.role, "finance:plan")) {
    return (
      <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-8 text-[var(--admin-muted)]">
        Financial planning requires the <code>finance:plan</code> permission (OWNER or FINANCE).
      </div>
    );
  }

  const sp = await searchParams;
  const assumptions = assumptionsFromSearchParams(sp);
  const forecast = runForecast(assumptions);
  const comparison = compareScenarios({ ...assumptions, scenario: "base" });
  const qs = assumptionsToQuery(assumptions);

  const h = await headers();
  await recordStaffAudit("finance.plan_viewed", {
    staffPrincipalId: session.staffPrincipalId,
    rateLimitSalt: env.RATE_LIMIT_SALT,
    ip: requestIp(h),
    bestEffort: true,
    meta: { scenario: assumptions.scenario, horizonMonths: assumptions.horizonMonths },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Financial planning</h1>
        <p className="mt-2 max-w-3xl text-[var(--admin-muted)]">{forecast.disclaimer}</p>
        <p className="mt-2 text-xs text-[var(--admin-muted)]">
          Provenance: {assumptions.provenance} · Currency: AUD · Tax: {forecast.taxTreatment}
        </p>
      </div>

      <AssumptionsForm a={assumptions} />

      <div className="flex flex-wrap gap-3">
        <a
          href={`/api/finance/export?${qs}`}
          className="rounded-full bg-[var(--admin-accent)] px-4 py-2 text-sm font-semibold text-[#fff8f4]"
        >
          Export monthly CSV
        </a>
        <Link href="/finance/formulas" className="rounded-full border border-[var(--admin-line)] px-4 py-2 text-sm font-semibold">
          Calculation formulas
        </Link>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Projected gross revenue" value={aud(forecast.totals.grossRevenue)} hint={`${assumptions.horizonMonths} mo · ${assumptions.scenario}`} />
        <Stat label="Projected total costs" value={aud(forecast.totals.totalCosts)} />
        <Stat label="Projected profit" value={aud(forecast.totals.profit)} />
        <Stat label="Recurring (subscriptions)" value={aud(forecast.totals.subscriptionRevenue)} hint="Annual plans recognised /12" />
      </section>

      <section className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
        <h2 className="text-lg font-semibold">Monthly projection — {SCENARIO_MULTIPLIERS[assumptions.scenario].label}</h2>
        <p className="mt-1 text-sm text-[var(--admin-muted)]">{SCENARIO_MULTIPLIERS[assumptions.scenario].description}</p>
        <div className="mt-4">
          <ProjectionChart
            months={forecast.months}
            series={[
              { key: "grossRevenue", label: "Gross revenue", color: "#301b43" },
              { key: "totalCosts", label: "Total costs", color: "#9c7edb" },
              { key: "profit", label: "Profit", color: "#2f6f4e" },
              { key: "recurringMrr", label: "Recurring MRR", color: "#b45309" },
            ]}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
        <h2 className="text-lg font-semibold">Scenario comparison (same editable inputs)</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[var(--admin-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Scenario</th>
                <th className="px-3 py-2 font-medium">Gross revenue</th>
                <th className="px-3 py-2 font-medium">Costs</th>
                <th className="px-3 py-2 font-medium">Profit</th>
                <th className="px-3 py-2 font-medium">Subscriptions</th>
                <th className="px-3 py-2 font-medium">Events</th>
              </tr>
            </thead>
            <tbody>
              {(["conservative", "base", "optimistic"] as const).map((id) => {
                const t = comparison[id].totals;
                return (
                  <tr key={id} className="border-t border-[var(--admin-line)]">
                    <td className="px-3 py-2 font-medium">{SCENARIO_MULTIPLIERS[id].label}</td>
                    <td className="px-3 py-2 tabular-nums">{aud(t.grossRevenue)}</td>
                    <td className="px-3 py-2 tabular-nums">{aud(t.totalCosts)}</td>
                    <td className="px-3 py-2 tabular-nums">{aud(t.profit)}</td>
                    <td className="px-3 py-2 tabular-nums">{aud(t.subscriptionRevenue)}</td>
                    <td className="px-3 py-2 tabular-nums">{aud(t.eventRevenue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)]">
        <div className="border-b border-[var(--admin-line)] px-4 py-3 font-semibold">Monthly detail (AUD, excl. GST)</div>
        <table className="min-w-full text-left text-sm">
          <thead className="text-[var(--admin-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Month</th>
              <th className="px-3 py-2 font-medium">Gross</th>
              <th className="px-3 py-2 font-medium">MRR</th>
              <th className="px-3 py-2 font-medium">Events</th>
              <th className="px-3 py-2 font-medium">Costs</th>
              <th className="px-3 py-2 font-medium">Profit</th>
              <th className="px-3 py-2 font-medium">Plus m/a</th>
            </tr>
          </thead>
          <tbody>
            {forecast.months.map((m) => (
              <tr key={m.monthIndex} className="border-t border-[var(--admin-line)]">
                <td className="px-3 py-2 whitespace-nowrap">{m.label}</td>
                <td className="px-3 py-2 tabular-nums">{aud(m.grossRevenue)}</td>
                <td className="px-3 py-2 tabular-nums">{aud(m.recurringMrr)}</td>
                <td className="px-3 py-2 tabular-nums">{aud(m.eventRevenue)}</td>
                <td className="px-3 py-2 tabular-nums">{aud(m.totalCosts)}</td>
                <td className="px-3 py-2 tabular-nums">{aud(m.profit)}</td>
                <td className="px-3 py-2 tabular-nums text-[var(--admin-muted)]">
                  {m.plusMonthly.toFixed(0)}/{m.plusAnnual.toFixed(0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--admin-muted)]">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint ? <p className="mt-1 text-xs text-[var(--admin-muted)]">{hint}</p> : null}
    </div>
  );
}
