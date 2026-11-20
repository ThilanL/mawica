import { NextResponse } from "next/server";
import { requirePermission, StaffAuthzError } from "@/lib/authz";
import { CmsValidationError, getCmsRevision } from "@/modules/staff/cms";

type Ctx = { params: Promise<{ key: string; revisionId: string }> };

/** Authenticated revision payload for compare/restore UI — never public. */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const session = await requirePermission("cms:read");
    const { key, revisionId } = await ctx.params;
    const rev = await getCmsRevision(decodeURIComponent(key), revisionId, session.role);
    return NextResponse.json({ revision: rev });
  } catch (e) {
    if (e instanceof StaffAuthzError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof CmsValidationError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
