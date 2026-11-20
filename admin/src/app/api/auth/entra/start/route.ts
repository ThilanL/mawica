import { NextResponse } from "next/server";
import { createPkce, entraAuthorizeUrl } from "@/lib/entra";
import { entraConfigured } from "@/lib/env";
import { adminAppUrl, sessionCookieSecure } from "@/lib/origins";

export async function GET() {
  if (!entraConfigured()) {
    return NextResponse.redirect(adminAppUrl("/sign-in?error=Entra%20not%20configured"));
  }
  const state = crypto.randomUUID();
  const { verifier, challenge } = createPkce();
  const res = NextResponse.redirect(entraAuthorizeUrl(state, challenge));
  res.cookies.set("mawica_admin_oauth", JSON.stringify({ state, verifier }), {
    httpOnly: true,
    secure: sessionCookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
