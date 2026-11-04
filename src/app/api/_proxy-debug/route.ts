import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { clientIp, hashFor } from "@/modules/security/client-hash";

const notFound = () => new NextResponse("Not found", { status: 404 });

/**
 * Staging-only diagnostic for verifying the trusted-proxy hop count (docs/azure-staging.md).
 * 404 unless ENABLE_PROXY_DEBUG=1 AND the caller sends a matching x-admin-token. Returns the raw header,
 * the configured hop count and the address the rate limiter would use. Never enable in production.
 */
export async function GET(request: Request) {
  if (env.ENABLE_PROXY_DEBUG !== "1" || !env.ADMIN_TOKEN) return notFound();
  const given = Buffer.from(request.headers.get("x-admin-token") ?? "");
  const want = Buffer.from(env.ADMIN_TOKEN);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return notFound();
  const ip = clientIp(request.headers);
  return NextResponse.json(
    { xForwardedFor: request.headers.get("x-forwarded-for"), trustedProxyHops: env.TRUSTED_PROXY_HOPS, rateLimitClient: ip, bucketPrefix: hashFor("publish", ip).slice(0, 8) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
