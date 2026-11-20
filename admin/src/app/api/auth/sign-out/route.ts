import { NextResponse } from "next/server";
import { recordStaffAudit } from "@/modules/staff/audit";
import { requestIp } from "@/lib/client-ip";
import { env } from "@/lib/env";
import { adminAppUrl } from "@/lib/origins";
import { clearStaffSessionCookie, readStaffSession, STAFF_COOKIE } from "@/lib/session";

export async function POST(req: Request) {
  const session = await readStaffSession();
  if (session) {
    await recordStaffAudit("staff.sign_out", {
      staffPrincipalId: session.staffPrincipalId,
      rateLimitSalt: env.RATE_LIMIT_SALT,
      ip: requestIp(req.headers),
    });
  }
  await clearStaffSessionCookie();
  const res = NextResponse.redirect(adminAppUrl("/sign-in"));
  res.cookies.delete(STAFF_COOKIE);
  return res;
}
