import { redirect } from "next/navigation";
import { listModerationAudit } from "@/modules/staff/moderation";
import { hasPermission } from "@/modules/staff/roles";
import { readStaffSession } from "@/lib/session";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await readStaffSession();
  if (!session) redirect("/sign-in");
  if (!hasPermission(session.role, "audit:read")) {
    return <p className="text-[var(--admin-muted)]">You do not have access to audit history.</p>;
  }

  const sp = await searchParams;
  const page = Number(sp.page || "1") || 1;
  const data = await listModerationAudit({ page, pageSize: 25 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Moderation history</h1>
        <p className="mt-2 text-[var(--admin-muted)]">Staff soft-remove and restore actions from AuditLog.</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--admin-line)] text-[var(--admin-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Staff</th>
              <th className="px-4 py-3 font-medium">Meta</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-[var(--admin-muted)]">
                  No moderation audit events yet.
                </td>
              </tr>
            ) : (
              data.rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--admin-line)]">
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{r.action}</td>
                  <td className="px-4 py-3">
                    {r.staff ? (
                      <>
                        {r.staff.displayName}
                        <div className="text-xs text-[var(--admin-muted)]">{r.staff.role}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {r.meta ? JSON.stringify(r.meta) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
