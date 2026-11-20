import "server-only";
import { env } from "./env";

/**
 * Canonical public origin for redirects and cookies.
 * Never derived from X-Forwarded-Host / Host — those are attacker-controlled at the edge.
 */
export function adminAppOrigin(): string {
  return new URL(env.ADMIN_APP_URL).origin;
}

/** Absolute URL under ADMIN_APP_URL (path must start with /). */
export function adminAppUrl(path = "/"): string {
  return new URL(path, env.ADMIN_APP_URL).toString();
}

/**
 * Origins trusted for browser Origin checks.
 * Always includes ADMIN_APP_URL; optional ADMIN_TRUSTED_ORIGINS is an explicit allowlist only.
 */
export function adminTrustedOrigins(): string[] {
  const out = new Set<string>([adminAppOrigin()]);
  for (const raw of (env.ADMIN_TRUSTED_ORIGINS ?? "").split(",")) {
    const s = raw.trim();
    if (!s) continue;
    try {
      out.add(new URL(s).origin);
    } catch {
      /* ignore malformed */
    }
  }
  return [...out];
}

export function isTrustedAdminOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return false;
  return adminTrustedOrigins().includes(origin);
}

export function sessionCookieSecure(): boolean {
  return adminAppOrigin().startsWith("https://");
}
