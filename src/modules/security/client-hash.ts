import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";

/** First hop of X-Forwarded-For (Azure App Service sets it), else a fixed bucket. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd ?? headers.get("x-real-ip") ?? "unknown").replace(/:\d+$/, "");
}

/** Keyed hash so raw IPs are never stored. Rotating RATE_LIMIT_SALT unlinks old data. */
export function hashFor(scope: string, ip: string): string {
  return createHmac("sha256", env.RATE_LIMIT_SALT).update(`${scope}|${ip}`).digest("hex");
}
