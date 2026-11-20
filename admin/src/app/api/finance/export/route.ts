import { NextResponse } from "next/server";
import { requestIp } from "@/lib/client-ip";
import { env } from "@/lib/env";
import { readStaffSession } from "@/lib/session";
import { buildFinanceProjectionCsv } from "@/modules/staff/finance/export";
import { assumptionsFromSearchParams } from "@/modules/staff/finance/parse";
import { hasPermission, StaffAuthzError } from "@/modules/staff/roles";

export async function GET(req: Request) {
  const session = await readStaffSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.role, "finance:plan")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const assumptions = assumptionsFromSearchParams(url.searchParams);
    const { filename, body } = await buildFinanceProjectionCsv(assumptions, {
      role: session.role,
      staffPrincipalId: session.staffPrincipalId,
      rateLimitSalt: env.RATE_LIMIT_SALT,
      ip: requestIp(req.headers),
    });
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof StaffAuthzError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    console.error("[finance.export]", e instanceof Error ? e.name : "error");
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
