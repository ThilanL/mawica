import { NextResponse } from "next/server";
import { z } from "zod";
import { softRemoveCard } from "@/modules/staff/moderation";
import { StaffAuthzError } from "@/modules/staff/roles";
import { requirePermission } from "@/lib/authz";
import { requestIp } from "@/lib/client-ip";
import { env } from "@/lib/env";

const bodySchema = z.object({
  slug: z.string().min(1).max(16),
  reason: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  try {
    const session = await requirePermission("cards:remove");
    const json = bodySchema.parse(await req.json());
    const result = await softRemoveCard({
      slug: json.slug,
      reason: json.reason,
      role: session.role,
      staffPrincipalId: session.staffPrincipalId,
      rateLimitSalt: env.RATE_LIMIT_SALT,
      ip: requestIp(req.headers),
    });
    if (!result.ok) {
      return NextResponse.json({ error: "Card not found or not published" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, slug: result.slug });
  } catch (e) {
    if (e instanceof StaffAuthzError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
