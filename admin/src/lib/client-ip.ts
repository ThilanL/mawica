import "server-only";
import { env } from "./env";

/**
 * Client IP for audit/rate-limit hashing.
 * Only trusts X-Forwarded-For when TRUSTED_PROXY_HOPS > 0 (e.g. 1 behind Azure Container Apps).
 * Never uses X-Forwarded-Host for auth origins (see origins.ts).
 */
export function requestIp(headers: Headers): string | null {
  const hops = env.TRUSTED_PROXY_HOPS;
  if (hops <= 0) return null;
  const xff = headers.get("x-forwarded-for");
  if (!xff) return null;
  const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  // Client is hops entries from the right (last is closest proxy).
  const idx = parts.length - hops;
  if (idx < 0) return parts[0] ?? null;
  return parts[idx] ?? null;
}
