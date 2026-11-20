import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getCustomerDetail } from "@/modules/staff/customers";
import { hasPermission } from "@/modules/staff/roles";
import { requestIp } from "@/lib/client-ip";
import { env } from "@/lib/env";
import { readStaffSession } from "@/lib/session";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await readStaffSession();
  if (!session) redirect("/sign-in");
  if (!hasPermission(session.role, "users:read")) {
    return (
      <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-8 text-[var(--admin-muted)]">
        Forbidden.
      </div>
    );
  }

  const { id } = await params;
  const h = await headers();
  const includeWallet = hasPermission(session.role, "wallet:read");
  const customer = await getCustomerDetail(id, {
    role: session.role,
    staffPrincipalId: session.staffPrincipalId,
    rateLimitSalt: env.RATE_LIMIT_SALT,
    ip: requestIp(h),
    includeWallet,
  });
  if (!customer) notFound();

  const w = customer.wallet;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/customers" className="text-sm text-[var(--admin-muted)] hover:underline">
          ← Customers
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{customer.displayName || "Customer"}</h1>
        <p className="mt-1 break-all text-[var(--admin-muted)]">{customer.email}</p>
        <p className="mt-2 text-xs text-[var(--admin-muted)]">
          Detail views are audited. Message bodies and private media are not loaded.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Email verified" value={customer.emailVerified ? "Yes" : "No"} />
        <Stat label="Time zone" value={customer.timeZone ?? "—"} />
        <Stat label="Joined" value={new Date(customer.createdAt).toLocaleString()} />
        <Stat label="Recipients saved" value={String(customer.recipients)} />
      </section>

      <section className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-5">
        <h2 className="text-lg font-semibold">Cards</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          <Stat label="Total" value={String(customer.cards.total)} compact />
          <Stat label="Published" value={String(customer.cards.published)} compact />
          <Stat label="Scheduled" value={String(customer.cards.scheduled)} compact />
          <Stat label="Removed" value={String(customer.cards.removed)} compact />
          <Stat label="Cancelled" value={String(customer.cards.cancelled)} compact />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Stat label="Active schedules" value={String(customer.schedules.active)} compact />
          <Stat label="Failed schedules" value={String(customer.schedules.failed)} compact />
        </div>
      </section>

      {includeWallet ? (
        w ? (
          <section className="space-y-4">
            <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-5">
              <h2 className="text-lg font-semibold">Wallet</h2>
              <p className="mt-1 text-sm text-[var(--admin-muted)]">
                Read-only snapshot of existing grants and ledger entries. Balances are not modified.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Plan" value={`${w.planName} (${w.planKey})`} compact />
                <Stat label="Total sends remaining" value={String(w.balances.totalRemaining)} compact />
                <Stat label="Premium remaining" value={String(w.balances.premiumRemaining)} compact />
                <Stat label="Welcome premium left" value={String(w.balances.welcomePremiumRemaining)} compact />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Stat label="Period premium left" value={String(w.balances.periodPremiumRemaining)} compact />
                <Stat label="Purchasable plan" value={w.planPurchasable ? "Yes" : "No"} compact />
              </div>

              <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
                Plan entitlements
              </h3>
              {w.entitlements.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--admin-muted)]">No entitlement rows.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {w.entitlements.map((e) => (
                    <li key={e.key} className="flex justify-between gap-4 border-b border-[var(--admin-line)] py-1.5">
                      <span>{e.key}</span>
                      <span className="tabular-nums text-[var(--admin-muted)]">
                        {e.value === null ? "∞" : e.value} · {e.period}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)]">
              <div className="border-b border-[var(--admin-line)] px-4 py-3 font-semibold">Credit grants</div>
              <table className="min-w-full text-left text-sm">
                <thead className="text-[var(--admin-muted)]">
                  <tr>
                    <th className="px-4 py-2 font-medium">Source</th>
                    <th className="px-4 py-2 font-medium">Unit</th>
                    <th className="px-4 py-2 font-medium">Remaining</th>
                    <th className="px-4 py-2 font-medium">Valid</th>
                    <th className="px-4 py-2 font-medium">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {w.grants.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-[var(--admin-muted)]">
                        No grants on this account yet.
                      </td>
                    </tr>
                  ) : (
                    w.grants.map((g) => (
                      <tr key={g.id} className="border-t border-[var(--admin-line)]">
                        <td className="px-4 py-2">{g.source}</td>
                        <td className="px-4 py-2">{g.unit}</td>
                        <td className="px-4 py-2 tabular-nums">
                          {g.remaining}/{g.amount}
                        </td>
                        <td className="px-4 py-2 text-xs text-[var(--admin-muted)]">
                          {new Date(g.validFrom).toLocaleDateString()}
                          {g.validTo ? ` → ${new Date(g.validTo).toLocaleDateString()}` : " → ∞"}
                        </td>
                        <td className="px-4 py-2">{g.active ? "Yes" : "No"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)]">
              <div className="border-b border-[var(--admin-line)] px-4 py-3 font-semibold">Ledger (recent)</div>
              <table className="min-w-full text-left text-sm">
                <thead className="text-[var(--admin-muted)]">
                  <tr>
                    <th className="px-4 py-2 font-medium">When</th>
                    <th className="px-4 py-2 font-medium">Kind</th>
                    <th className="px-4 py-2 font-medium">Delta</th>
                    <th className="px-4 py-2 font-medium">Grant</th>
                    <th className="px-4 py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {w.ledger.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-[var(--admin-muted)]">
                        No ledger entries yet.
                      </td>
                    </tr>
                  ) : (
                    w.ledger.map((l) => (
                      <tr key={l.id} className="border-t border-[var(--admin-line)]">
                        <td className="px-4 py-2 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-2">{l.kind}</td>
                        <td className="px-4 py-2 tabular-nums">{l.delta}</td>
                        <td className="px-4 py-2 text-xs">
                          {l.grantSource}/{l.grantUnit}
                        </td>
                        <td className="px-4 py-2 text-[var(--admin-muted)]">{l.reason ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-6 text-[var(--admin-muted)]">
            No wallet account yet. The consumer creates one on first authenticated wallet access — admin does not create
            wallets.
          </div>
        )
      ) : (
        <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-6 text-[var(--admin-muted)]">
          Wallet details require the <code>wallet:read</code> permission.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={compact ? "" : "rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4"}>
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--admin-muted)]">{label}</div>
      <div className={`mt-1 break-words font-semibold ${compact ? "text-base" : "text-lg"}`}>{value}</div>
    </div>
  );
}
