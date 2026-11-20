import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DateRangeFilter } from "@/components/ops/DateRangeFilter";
import { requestIp } from "@/lib/client-ip";
import { env } from "@/lib/env";
import { readStaffSession } from "@/lib/session";
import { loadOpsDashboard, type OpsDashboard } from "@/modules/staff/ops/analytics";
import { formatYmd, OpsDateRangeError, resolveOpsDateRange, type OpsDateRange } from "@/modules/staff/ops/dates";
import { hasPermission, type StaffRoleName } from "@/modules/staff/roles";

export async function requireOpsSession(): Promise<{
  role: StaffRoleName;
  staffPrincipalId: string;
  email: string;
}> {
  const session = await readStaffSession();
  if (!session) redirect("/sign-in");
  if (!hasPermission(session.role, "ops:read")) {
    redirect("/ops");
  }
  return session;
}

export async function loadOpsPageData(searchParams: Promise<{ preset?: string; from?: string; to?: string }>): Promise<{
  session: Awaited<ReturnType<typeof requireOpsSession>>;
  range: OpsDateRange;
  rangeError: string | null;
  data: OpsDashboard;
  exportQuery: string;
}> {
  const session = await requireOpsSession();
  const sp = await searchParams;
  let rangeError: string | null = null;
  let range: OpsDateRange;
  try {
    range = resolveOpsDateRange(sp);
  } catch (e) {
    rangeError = e instanceof OpsDateRangeError ? e.message : "Invalid date range";
    range = resolveOpsDateRange({ preset: "30d" });
  }
  const h = await headers();
  const data = await loadOpsDashboard(range, {
    role: session.role,
    staffPrincipalId: session.staffPrincipalId,
    rateLimitSalt: env.RATE_LIMIT_SALT,
    ip: requestIp(h),
  });
  const qs = new URLSearchParams();
  qs.set("preset", range.preset);
  if (range.preset === "custom") {
    qs.set("from", formatYmd(range.from));
    qs.set("to", formatYmd(new Date(range.toExclusive.getTime() - 1)));
  }
  return { session, range, rangeError, data, exportQuery: qs.toString() };
}

export function OpsDetailShell({
  title,
  range,
  rangeError,
  basePath,
  children,
}: {
  title: string;
  range: OpsDateRange;
  rangeError: string | null;
  basePath: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/ops" className="text-sm text-[var(--admin-muted)] hover:underline">
          ← Operations
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-[var(--admin-muted)]">{range.label}</p>
      </div>
      {rangeError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{rangeError}</div>
      ) : null}
      <DateRangeFilter
        preset={range.preset}
        from={range.preset === "custom" ? formatYmd(range.from) : undefined}
        to={range.preset === "custom" ? formatYmd(new Date(range.toExclusive.getTime() - 1)) : undefined}
        basePath={basePath}
      />
      {children}
    </div>
  );
}
