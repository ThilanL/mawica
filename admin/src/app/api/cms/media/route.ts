import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, StaffAuthzError } from "@/lib/authz";
import { requestIp } from "@/lib/client-ip";
import { env } from "@/lib/env";
import { listMarketingAssets, uploadMarketingAsset } from "@/modules/staff/marketing-media";
import { CmsMediaError } from "@mawica/modules/cms/marketing-media/validate";

export async function GET(req: Request) {
  try {
    const session = await requirePermission("cms:read");
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? undefined;
    const kindRaw = url.searchParams.get("kind") ?? "ALL";
    const kind = z.enum(["IMAGE", "VIDEO", "ALL"]).parse(kindRaw);
    const assets = await listMarketingAssets({ role: session.role, q, kind });
    return NextResponse.json({ assets });
  } catch (e) {
    if (e instanceof StaffAuthzError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof CmsMediaError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("cms:write");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const title = String(form.get("title") ?? "").trim();
    const altText = String(form.get("altText") ?? "").trim();
    const bytes = Buffer.from(await file.arrayBuffer());
    const asset = await uploadMarketingAsset({
      role: session.role,
      staffPrincipalId: session.staffPrincipalId,
      rateLimitSalt: env.RATE_LIMIT_SALT,
      ip: requestIp(req.headers),
      bytes,
      declaredContentType: file.type || null,
      filename: file.name,
      title,
      altText,
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (e) {
    if (e instanceof StaffAuthzError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof CmsMediaError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
