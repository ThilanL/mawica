import Link from "next/link";
import { redirect } from "next/navigation";
import { readStaffSession } from "@/lib/session";
import { listCmsDocuments } from "@/modules/staff/cms";
import { hasPermission } from "@/modules/staff/roles";

export default async function CmsIndexPage() {
  const session = await readStaffSession();
  if (!session) redirect("/sign-in");
  if (!hasPermission(session.role, "cms:read")) {
    return (
      <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-8 text-[var(--admin-muted)]">
        CMS requires the <code>cms:read</code> permission.
      </div>
    );
  }

  const documents = await listCmsDocuments(session.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Marketing CMS</h1>
        <p className="mt-2 max-w-3xl text-[var(--admin-muted)]">
          Edit homepage, navigation, footer, legal and SEO copy. Drafts stay private until an OWNER publishes.
          Public pages fall back to static TypeScript content when nothing is published.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)]">
        <table className="min-w-full text-left text-sm">
          <thead className="text-[var(--admin-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Document</th>
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Draft</th>
              <th className="px-4 py-3 font-medium">Published</th>
              <th className="px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.key} className="border-t border-[var(--admin-line)]">
                <td className="px-4 py-3">
                  <Link href={`/cms/${encodeURIComponent(d.key)}`} className="font-medium underline-offset-2 hover:underline">
                    {d.title}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{d.key}</td>
                <td className="px-4 py-3 tabular-nums">{d.draftVersion || "—"}</td>
                <td className="px-4 py-3">
                  {d.publishedRevisionNumber != null
                    ? `Rev ${d.publishedRevisionNumber}`
                    : d.seeded
                      ? "Draft only"
                      : "Fallback"}
                </td>
                <td className="px-4 py-3 text-[var(--admin-muted)]">
                  {d.updatedAt ? new Date(d.updatedAt).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
