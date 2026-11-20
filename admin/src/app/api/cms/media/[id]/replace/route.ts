import { NextResponse } from "next/server";
import { requirePermission, StaffAuthzError } from "@/lib/authz";
import { requestIp } from "@/lib/client-ip";
import { env } from "@/lib/env";
import { replaceMarketingAsset } from "@/modules/staff/marketing-media";
import { CmsMediaError } from "@mawica/modules/cms/marketing-media/validate";

type Ctx = { params: Promise<{ id: string }> };

/** Replace bytes for an existing marketing asset (CDN URL / id unchanged). */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const session = await requirePermission("cms:write");
    const { id } = await ctx.params;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const asset = await replaceMarketingAsset({
      id,
      role: session.role,
      staffPrincipalId: session.staffPrincipalId,
      rateLimitSalt: env.RATE_LIMIT_SALT,
      ip: requestIp(req.headers),
      bytes,
      declaredContentType: file.type || null,
      filename: file.name,
    });
    return NextResponse.json({ asset });
  } catch (e) {
    if (e instanceof StaffAuthzError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof CmsMediaError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
