import { NextResponse } from "next/server";
import { createPkce, entraAuthorizeUrl } from "@/lib/entra";
import { entraConfigured, env } from "@/lib/env";

export async function GET() {
  if (!entraConfigured()) {
    return NextResponse.redirect(new URL("/sign-in?error=Entra%20not%20configured", env.ADMIN_APP_URL));
  }
  const state = crypto.randomUUID();
  const { verifier, challenge } = createPkce();
  const res = NextResponse.redirect(entraAuthorizeUrl(state, challenge));
  res.cookies.set("mawica_admin_oauth", JSON.stringify({ state, verifier }), {
    httpOnly: true,
    secure: env.ADMIN_APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
