import { NextResponse } from "next/server";
import { recordStaffAudit } from "@/modules/staff/audit";
import { resolveSeedRoleFromAllowlist } from "@/modules/staff/roles";
import { upsertStaffPrincipal } from "@/modules/staff/principals";
import { requestIp } from "@/lib/client-ip";
import { exchangeEntraCode } from "@/lib/entra";
import { env } from "@/lib/env";
import { createStaffSessionToken, setStaffSessionCookie } from "@/lib/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  if (err) {
    return NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent(err)}`, env.ADMIN_APP_URL));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/sign-in?error=Missing%20code", env.ADMIN_APP_URL));
  }

  const cookie = req.headers.get("cookie") ?? "";
  const match = /mawica_admin_oauth=([^;]+)/.exec(cookie);
  if (!match) {
    return NextResponse.redirect(new URL("/sign-in?error=OAuth%20state%20missing", env.ADMIN_APP_URL));
  }
  let oauth: { state: string; verifier: string };
  try {
    oauth = JSON.parse(decodeURIComponent(match[1])) as { state: string; verifier: string };
  } catch {
    return NextResponse.redirect(new URL("/sign-in?error=OAuth%20state%20invalid", env.ADMIN_APP_URL));
  }
  if (oauth.state !== state) {
    return NextResponse.redirect(new URL("/sign-in?error=OAuth%20state%20mismatch", env.ADMIN_APP_URL));
  }

  try {
    const profile = await exchangeEntraCode({ code, codeVerifier: oauth.verifier });
    const seed = resolveSeedRoleFromAllowlist(env.ADMIN_STAFF_ALLOWLIST, {
      entraOid: profile.oid,
      email: profile.email,
    });
    if (!seed) {
      return NextResponse.redirect(new URL("/sign-in?error=Not%20allowlisted", env.ADMIN_APP_URL));
    }
    const principal = await upsertStaffPrincipal({
      entraOid: profile.oid,
      email: profile.email,
      displayName: profile.displayName,
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
    const res = NextResponse.redirect(new URL("/", env.ADMIN_APP_URL));
    await setStaffSessionCookie(token);
    // setStaffSessionCookie uses next/headers cookies(); also set on redirect response for reliability
    res.cookies.set("mawica_admin_session", token, {
      httpOnly: true,
      secure: env.ADMIN_APP_URL.startsWith("https://"),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    res.cookies.delete("mawica_admin_oauth");
    await recordStaffAudit("staff.sign_in", {
      staffPrincipalId: principal.id,
      rateLimitSalt: env.RATE_LIMIT_SALT,
      ip: requestIp(req.headers),
      meta: { method: "entra" },
    });
    return res;
  } catch {
    return NextResponse.redirect(new URL("/sign-in?error=Sign-in%20failed", env.ADMIN_APP_URL));
  }
}
