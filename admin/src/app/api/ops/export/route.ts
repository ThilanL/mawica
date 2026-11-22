import { NextResponse } from "next/server";
import { requestIp } from "@/lib/client-ip";
import { env } from "@/lib/env";
import { readStaffSession } from "@/lib/session";
import { buildOpsCsv, type OpsExportDataset } from "@/modules/staff/ops/analytics";
import { OpsDateRangeError, resolveOpsDateRange } from "@/modules/staff/ops/dates";
import { recordStaffAudit } from "@/modules/staff/audit";
import { hasPermission, StaffAuthzError } from "@/modules/staff/roles";

const DATASETS = new Set<OpsExportDataset>([
  "customers",
  "cards",
  "deliveries",
  "moderation",
  "wallet",
  "media",
]);

export async function GET(req: Request) {
  const session = await readStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "ops:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const dataset = url.searchParams.get("dataset") as OpsExportDataset | null;
  if (!dataset || !DATASETS.has(dataset)) {
    return NextResponse.json({ error: "Unknown dataset" }, { status: 400 });
  }

  try {
    const range = resolveOpsDateRange({
      preset: url.searchParams.get("preset"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    const { filename, body } = await buildOpsCsv(dataset, range, session.role);
    await recordStaffAudit("ops.export_downloaded", {
      staffPrincipalId: session.staffPrincipalId,
      rateLimitSalt: env.RATE_LIMIT_SALT,
      ip: requestIp(req.headers),
      bestEffort: true,
      meta: { dataset, preset: range.preset },
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
    if (e instanceof OpsDateRangeError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof StaffAuthzError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    console.error("[ops.export]", e instanceof Error ? e.name : "error");
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
