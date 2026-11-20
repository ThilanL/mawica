import Link from "next/link";
import { redirect } from "next/navigation";
import { FORMULAS } from "@/modules/staff/finance/forecast";
import { SCENARIO_MULTIPLIERS, FINANCE_DISCLAIMER } from "@/modules/staff/finance/defaults";
import { readStaffSession } from "@/lib/session";
import { hasPermission } from "@/modules/staff/roles";

export default async function FinanceFormulasPage() {
  const session = await readStaffSession();
  if (!session) redirect("/sign-in");
  if (!hasPermission(session.role, "finance:plan")) {
    return <p className="text-[var(--admin-muted)]">Forbidden.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/finance" className="text-sm text-[var(--admin-muted)] hover:underline">
          ← Finance plan
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Formulas & scenarios</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--admin-muted)]">{FINANCE_DISCLAIMER}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Scenarios</h2>
        <ul className="space-y-2">
          {(["conservative", "base", "optimistic"] as const).map((id) => {
            const s = SCENARIO_MULTIPLIERS[id];
            return (
              <li key={id} className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4 text-sm">
                <div className="font-semibold">{s.label}</div>
                <p className="mt-1 text-[var(--admin-muted)]">{s.description}</p>
                <p className="mt-2 tabular-nums text-xs text-[var(--admin-muted)]">
                  growth×{s.growth} · conversion×{s.conversion} · churn×{s.churn} · acquisitions×{s.acquisitions} ·
                  events×{s.eventGrowth}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Calculation explanations</h2>
        <ul className="space-y-3">
          {FORMULAS.map((f) => (
            <li key={f.id} className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-[var(--admin-muted)]">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-dashed border-[var(--admin-line)] bg-[var(--admin-card)] p-4 text-sm text-[var(--admin-muted)]">
        <p>
          Plans modelled: Free (AUD 0), Plus, Event (one-time bookings), Corporate, Unlimited — monthly and annual list
          prices where applicable. No Stripe integration. No wallet/ledger coupling.
        </p>
      </section>
    </div>
  );
}
