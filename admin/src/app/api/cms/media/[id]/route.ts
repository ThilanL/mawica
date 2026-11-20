import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, StaffAuthzError } from "@/lib/authz";
import { requestIp } from "@/lib/client-ip";
import { env } from "@/lib/env";
import {
  getMarketingAsset,
  softDeleteMarketingAsset,
  updateMarketingAssetMeta,
} from "@/modules/staff/marketing-media";
import { CmsMediaError } from "@mawica/modules/cms/marketing-media/validate";

const patchSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  altText: z.string().min(1).max(300).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const session = await requirePermission("cms:read");
    const { id } = await ctx.params;
    const asset = await getMarketingAsset(id, session.role);
    return NextResponse.json({ asset });
  } catch (e) {
    if (e instanceof StaffAuthzError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof CmsMediaError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const session = await requirePermission("cms:write");
    const { id } = await ctx.params;
    const body = patchSchema.parse(await req.json());
    const asset = await updateMarketingAssetMeta({
      id,
      role: session.role,
      staffPrincipalId: session.staffPrincipalId,
      rateLimitSalt: env.RATE_LIMIT_SALT,
      ip: requestIp(req.headers),
      title: body.title,
      altText: body.altText,
    });
    return NextResponse.json({ asset });
  } catch (e) {
    if (e instanceof StaffAuthzError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof CmsMediaError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const session = await requirePermission("cms:write");
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "1";
    const result = await softDeleteMarketingAsset({
      id,
      role: session.role,
      staffPrincipalId: session.staffPrincipalId,
      rateLimitSalt: env.RATE_LIMIT_SALT,
      ip: requestIp(req.headers),
      force,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof StaffAuthzError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof CmsMediaError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
