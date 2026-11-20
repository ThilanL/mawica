import { NextResponse } from "next/server";

/**
 * Process liveness for Azure Container Apps.
 * Does not touch the database — dependency readiness is /api/health/ready.
 * No env values, connection strings, or staff data.
 */
export async function GET() {
  return NextResponse.json(
    { status: "ok", check: "process" },
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } },
  );
}
