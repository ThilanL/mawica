import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { CmsEditor } from "@/components/cms/CmsEditor";
import { readStaffSession } from "@/lib/session";
import { CmsValidationError, getCmsDocument } from "@/modules/staff/cms";
import { hasPermission } from "@/modules/staff/roles";
import { isCmsDocumentKey } from "@mawica/modules/cms";

export default async function CmsDocumentPage({ params }: { params: Promise<{ key: string }> }) {
  const session = await readStaffSession();
  if (!session) redirect("/sign-in");
  if (!hasPermission(session.role, "cms:read")) {
    return (
      <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-8 text-[var(--admin-muted)]">
        CMS requires the <code>cms:read</code> permission.
      </div>
    );
  }

  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  if (!isCmsDocumentKey(key)) notFound();

  let doc;
  try {
    doc = await getCmsDocument(key, session.role);
  } catch (e) {
    if (e instanceof CmsValidationError) {
      return (
        <div className="space-y-4">
          <Link href="/cms" className="text-sm text-[var(--admin-muted)] hover:underline">
            ← CMS
          </Link>
          <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-8 text-[var(--admin-muted)]">
            {e.message}
          </div>
        </div>
      );
    }
    throw e;
  }

  return (
    <div className="space-y-4">
      <Link href="/cms" className="text-sm text-[var(--admin-muted)] hover:underline">
        ← All documents
      </Link>
      <CmsEditor
        documentKey={doc.key}
        title={doc.title}
        initialPayload={doc.draftPayload}
        draftVersion={doc.draftVersion}
        publishedAt={doc.publishedAt}
        publishedPayload={doc.publishedPayload}
        state={doc.state}
        revisions={doc.revisions.map((r) => ({
          id: r.id,
          revisionNumber: r.revisionNumber,
          note: r.note,
          publishedAt: r.publishedAt.toISOString(),
          publishedByStaffId: r.publishedByStaffId,
          publishedByName: r.publishedByName,
          publishedByEmail: r.publishedByEmail,
        }))}
        canWrite={hasPermission(session.role, "cms:write")}
        canPublish={hasPermission(session.role, "cms:publish")}
      />
    </div>
  );
}
