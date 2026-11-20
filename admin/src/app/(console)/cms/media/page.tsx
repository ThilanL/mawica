import { redirect } from "next/navigation";
import Link from "next/link";
import { MediaLibrary } from "@/components/cms/MediaLibrary";
import { readStaffSession } from "@/lib/session";
import { hasPermission } from "@/modules/staff/roles";

export default async function CmsMediaPage() {
  const session = await readStaffSession();
  if (!session) redirect("/sign-in");
  if (!hasPermission(session.role, "cms:read")) {
    return (
      <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-8 text-[var(--admin-muted)]">
        Marketing media requires <code>cms:read</code>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link href="/cms" className="text-sm text-[var(--admin-muted)] hover:underline">
        ← CMS documents
      </Link>
      <MediaLibrary canWrite={hasPermission(session.role, "cms:write")} />
    </div>
  );
}
