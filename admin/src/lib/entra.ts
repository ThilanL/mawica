import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { env, entraConfigured } from "./env";

export function entraAuthorizeUrl(state: string, codeChallenge: string): string {
  if (!entraConfigured()) throw new Error("Entra is not configured");
  const u = new URL(`https://login.microsoftonline.com/${env.ADMIN_ENTRA_TENANT_ID}/oauth2/v2.0/authorize`);
  u.searchParams.set("client_id", env.ADMIN_ENTRA_CLIENT_ID!);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", env.ADMIN_ENTRA_REDIRECT_URI!);
  u.searchParams.set("response_mode", "query");
  u.searchParams.set("scope", "openid profile email offline_access");
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export type EntraTokenProfile = {
  oid: string;
  email: string;
  displayName: string;
};

export async function exchangeEntraCode(opts: {
  code: string;
  codeVerifier: string;
}): Promise<EntraTokenProfile> {
  if (!entraConfigured()) throw new Error("Entra is not configured");
  const body = new URLSearchParams({
    client_id: env.ADMIN_ENTRA_CLIENT_ID!,
    client_secret: env.ADMIN_ENTRA_CLIENT_SECRET!,
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: env.ADMIN_ENTRA_REDIRECT_URI!,
    code_verifier: opts.codeVerifier,
    scope: "openid profile email offline_access",
  });
  const res = await fetch(`https://login.microsoftonline.com/${env.ADMIN_ENTRA_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("Entra token exchange failed");
  const json = (await res.json()) as { id_token?: string };
  if (!json.id_token) throw new Error("Entra id_token missing");
  return parseIdToken(json.id_token);
}

/** Decode JWT payload without verifying signature — token just arrived from Entra token endpoint over TLS. */
function parseIdToken(idToken: string): EntraTokenProfile {
  const part = idToken.split(".")[1];
  if (!part) throw new Error("Malformed id_token");
  const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  const oid = typeof payload.oid === "string" ? payload.oid : null;
  const emailRaw =
    (typeof payload.preferred_username === "string" && payload.preferred_username) ||
    (typeof payload.email === "string" && payload.email) ||
    (typeof payload.upn === "string" && payload.upn) ||
    null;
  const displayName =
    (typeof payload.name === "string" && payload.name) ||
    emailRaw ||
    "Staff";
  if (!oid || !emailRaw) throw new Error("Entra profile incomplete");
  return { oid, email: emailRaw.toLowerCase(), displayName };
}
