import Link from "next/link";
import { redirect } from "next/navigation";
import { listReports } from "@/modules/staff/moderation";
import { hasPermission } from "@/modules/staff/roles";
import { readStaffSession } from "@/lib/session";
import { RemoveCardForm } from "@/components/RemoveCardForm";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; reason?: string; status?: string; page?: string }>;
}) {
  const session = await readStaffSession();
  if (!session) redirect("/sign-in");
  if (!hasPermission(session.role, "reports:read")) {
    return <p className="text-[var(--admin-muted)]">You do not have access to the report queue.</p>;
  }

  const sp = await searchParams;
  const page = Number(sp.page || "1") || 1;
  const reason = ["INAPPROPRIATE", "HARASSMENT", "SPAM", "OTHER"].includes(sp.reason || "")
    ? (sp.reason as "INAPPROPRIATE" | "HARASSMENT" | "SPAM" | "OTHER")
    : undefined;
  const cardStatus = ["PUBLISHED", "REMOVED", "SCHEDULED", "CANCELLED"].includes(sp.status || "")
    ? (sp.status as "PUBLISHED" | "REMOVED" | "SCHEDULED" | "CANCELLED")
    : undefined;

  const data = await listReports({ q: sp.q, reason, cardStatus, page, pageSize: 20 });
  const canModerate = hasPermission(session.role, "cards:remove");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Report queue</h1>
        <p className="mt-2 text-[var(--admin-muted)]">
          {data.total} matching report{data.total === 1 ? "" : "s"}. Card messages and full reporter details are
          withheld.
        </p>
      </div>

      <form className="grid gap-3 rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4 sm:grid-cols-4">
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-[var(--admin-muted)]">Slug search</span>
          <input
            name="q"
            defaultValue={sp.q || ""}
            className="w-full rounded-xl border border-[var(--admin-line)] bg-white px-3 py-2"
            placeholder="card slug"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--admin-muted)]">Reason</span>
          <select name="reason" defaultValue={sp.reason || ""} className="w-full rounded-xl border border-[var(--admin-line)] bg-white px-3 py-2">
            <option value="">All</option>
            <option value="INAPPROPRIATE">Inappropriate</option>
            <option value="HARASSMENT">Harassment</option>
            <option value="SPAM">Spam</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--admin-muted)]">Card status</span>
          <select name="status" defaultValue={sp.status || ""} className="w-full rounded-xl border border-[var(--admin-line)] bg-white px-3 py-2">
            <option value="">All</option>
            <option value="PUBLISHED">Published</option>
            <option value="REMOVED">Removed</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="CANCELLED">Cancelled</option>
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
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Card</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Reports</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-[var(--admin-muted)]">
                  No reports match these filters.
                </td>
              </tr>
            ) : (
              data.rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--admin-line)] align-top">
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{r.reason}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.card.slug}</div>
                    <div className="text-xs text-[var(--admin-muted)]">
                      {r.card.templateKey} · {r.card.tier}
                    </div>
                  </td>
                  <td className="px-4 py-3">{r.card.status}</td>
                  <td className="px-4 py-3 tabular-nums">{r.card.reportCount}</td>
                  <td className="px-4 py-3 space-y-2">
                    <Link href={`/reports/${r.id}`} className="block text-[var(--admin-accent)] underline-offset-2 hover:underline">
                      View
                    </Link>
                    {canModerate && r.card.status === "PUBLISHED" ? (
                      <RemoveCardForm slug={r.card.slug} />
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} />
    </div>
  );
}

function Pagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      {page > 1 ? (
        <Link href={`?page=${page - 1}`} className="rounded-full border border-[var(--admin-line)] px-3 py-1.5">
          Previous
        </Link>
      ) : null}
      <span className="text-[var(--admin-muted)]">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={`?page=${page + 1}`} className="rounded-full border border-[var(--admin-line)] px-3 py-1.5">
          Next
        </Link>
      ) : null}
    </div>
  );
}
