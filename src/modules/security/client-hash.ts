import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";

export const UNIDENTIFIED = "unidentified";

/**
 * Pure helper (testable). Picks the client address from X-Forwarded-For.
 *
 * Trust model: every proxy APPENDS the address it saw to the right of the header, so only
 * entries added by *our own* proxies can be trusted. Anything to their left is client-controlled.
 * With `hops` trusted proxies, the client address is the entry `hops` places from the right.
 * `hops = 0` (default) means "no trusted proxy configured": forwarded headers are ignored and
 * every request falls into one shared bucket. That fails closed (spoofing cannot dodge limits)
 * but must be fixed by configuration in production (see docs/security.md).
 */
export function pickClientIp(xff: string | null, hops: number): string {
  if (hops <= 0 || !xff) return UNIDENTIFIED;
  const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < hops) return UNIDENTIFIED;
  let ip = parts[parts.length - hops];
  // Strip :port (IPv4) or [v6]:port; reject anything that is not a plausible address.
  ip = ip.replace(/^\[([0-9a-f:.]+)\](?::\d+)?$/i, "$1").replace(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/, "$1");
  return /^[0-9a-f:.]{2,45}$/i.test(ip) ? ip.toLowerCase() : UNIDENTIFIED;
}

export function clientIp(headers: Headers): string {
  return pickClientIp(headers.get("x-forwarded-for"), env.TRUSTED_PROXY_HOPS);
}

/** Keyed hash so raw IPs are never stored. Rotating RATE_LIMIT_SALT unlinks old data. */
export function hashFor(scope: string, ip: string): string {
  return createHmac("sha256", env.RATE_LIMIT_SALT).update(`${scope}|${ip}`).digest("hex");
}
