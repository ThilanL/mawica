import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, StaffAuthzError } from "@/lib/authz";
import { requestIp } from "@/lib/client-ip";
import { env } from "@/lib/env";
import {
  CmsConflictError,
  CmsValidationError,
  publishCmsDocument,
} from "@/modules/staff/cms";

const publishSchema = z.object({
  expectedDraftVersion: z.number().int().positive(),
  note: z.string().max(300).optional(),
});

type Ctx = { params: Promise<{ key: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const session = await requirePermission("cms:publish");
    const { key } = await ctx.params;
    const body = publishSchema.parse(await req.json());
    const doc = await publishCmsDocument({
      key,
      expectedDraftVersion: body.expectedDraftVersion,
      note: body.note,
      role: session.role,
      staffPrincipalId: session.staffPrincipalId,
      rateLimitSalt: env.RATE_LIMIT_SALT,
      ip: requestIp(req.headers),
    });
    return NextResponse.json(doc);
  } catch (e) {
    if (e instanceof StaffAuthzError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e instanceof CmsConflictError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    if (e instanceof CmsValidationError) {
      return NextResponse.json({ error: e.message, code: e.code, issues: e.issues }, { status: 400 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
