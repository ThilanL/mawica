import { NextResponse } from "next/server";
import { parseStaffRole, resolveSeedRoleFromAllowlist } from "@/modules/staff/roles";
import { upsertStaffPrincipal } from "@/modules/staff/principals";
import { recordStaffAudit } from "@/modules/staff/audit";
import { requestIp } from "@/lib/client-ip";
import { devAuthEnabled, env } from "@/lib/env";
import { createStaffSessionToken, setStaffSessionCookie } from "@/lib/session";

export async function POST(req: Request) {
  if (!devAuthEnabled()) {
    return NextResponse.json({ error: "Dev auth disabled" }, { status: 403 });
  }
  const email = (env.ADMIN_DEV_STAFF_EMAIL ?? "dev.admin@mawica.local").toLowerCase();
  const oid = env.ADMIN_DEV_STAFF_OID ?? "local-dev-oid";
  const seed =
    resolveSeedRoleFromAllowlist(env.ADMIN_STAFF_ALLOWLIST, { entraOid: oid, email }) ??
    parseStaffRole(env.ADMIN_DEV_STAFF_ROLE ?? "OWNER") ??
    "OWNER";

  const principal = await upsertStaffPrincipal({
    entraOid: oid,
    email,
    displayName: "Local Dev Admin",
    seedRole: seed,
  });
  if (!principal) {
    return NextResponse.redirect(new URL("/sign-in?error=Account%20disabled", env.ADMIN_APP_URL));
  }

  const token = await createStaffSessionToken({
    staffPrincipalId: principal.id,
    entraOid: principal.entraOid,
    email: principal.email,
    displayName: principal.displayName,
    role: principal.role,
  });
  await setStaffSessionCookie(token);
  await recordStaffAudit("staff.sign_in", {
    staffPrincipalId: principal.id,
    rateLimitSalt: env.RATE_LIMIT_SALT,
    ip: requestIp(req.headers),
    meta: { method: "dev" },
  });
  return NextResponse.redirect(new URL("/", env.ADMIN_APP_URL));
}
