import Link from "next/link";
import { redirect } from "next/navigation";
import { listCustomers } from "@/modules/staff/customers";
import { hasPermission } from "@/modules/staff/roles";
import { readStaffSession } from "@/lib/session";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; plan?: string; verified?: string; page?: string }>;
}) {
  const session = await readStaffSession();
  if (!session) redirect("/sign-in");
  if (!hasPermission(session.role, "users:read")) {
    return (
      <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-8 text-[var(--admin-muted)]">
        You do not have permission to view customers.
      </div>
    );
  }

  const sp = await searchParams;
  const page = Number(sp.page || "1") || 1;
  const verified = sp.verified === "yes" || sp.verified === "no" ? sp.verified : undefined;
  const data = await listCustomers({
    q: sp.q,
    planKey: sp.plan?.trim() || undefined,
    verified,
    page,
    pageSize: 20,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="mt-2 text-[var(--admin-muted)]">
          {data.total} account{data.total === 1 ? "" : "s"}. Card messages and private media are never loaded.
        </p>
      </div>

      <form className="grid gap-3 rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4 sm:grid-cols-4">
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-[var(--admin-muted)]">Search email or name</span>
          <input
            name="q"
            defaultValue={sp.q || ""}
            className="w-full rounded-xl border border-[var(--admin-line)] bg-white px-3 py-2"
            placeholder="email or display name"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--admin-muted)]">Plan</span>
          <select name="plan" defaultValue={sp.plan || ""} className="w-full rounded-xl border border-[var(--admin-line)] bg-white px-3 py-2">
            <option value="">All</option>
            <option value="free">free</option>
            <option value="plus">plus</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--admin-muted)]">Verified</span>
          <select
            name="verified"
            defaultValue={sp.verified || ""}
            className="w-full rounded-xl border border-[var(--admin-line)] bg-white px-3 py-2"
          >
            <option value="">All</option>
            <option value="yes">Verified</option>
            <option value="no">Unverified</option>
          </select>
        </label>
        <div className="sm:col-span-4">
          <button type="submit" className="rounded-full bg-[var(--admin-accent)] px-4 py-2 text-sm font-semibold text-[#fff8f4]">
            Apply filters
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--admin-line)] text-[var(--admin-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Verified</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Cards</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[var(--admin-muted)]">
                  No customers match these filters.
                </td>
              </tr>
            ) : (
              data.rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--admin-line)]">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.displayName || "—"}</div>
                    <div className="break-all text-xs text-[var(--admin-muted)]">{r.email}</div>
                  </td>
                  <td className="px-4 py-3">{r.emailVerified ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">{r.planKey ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{r.cardCount}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/customers/${r.id}`} className="text-[var(--admin-accent)] underline-offset-2 hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        baseQuery={{ q: sp.q, plan: sp.plan, verified: sp.verified }}
      />
    </div>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  baseQuery,
}: {
  page: number;
  pageSize: number;
  total: number;
  baseQuery: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const qs = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(baseQuery)) if (v) u.set(k, v);
    u.set("page", String(p));
    return `?${u.toString()}`;
  };
  return (
    <div className="flex items-center gap-3 text-sm">
      {page > 1 ? (
        <Link href={qs(page - 1)} className="rounded-full border border-[var(--admin-line)] px-3 py-1.5">
          Previous
        </Link>
      ) : null}
      <span className="text-[var(--admin-muted)]">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={qs(page + 1)} className="rounded-full border border-[var(--admin-line)] px-3 py-1.5">
          Next
        </Link>
      ) : null}
    </div>
  );
}
