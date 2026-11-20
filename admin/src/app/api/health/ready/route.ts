import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Dependency readiness for Azure Container Apps.
 * Confirms Postgres responds; never returns connection strings, roles, or env dumps.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", check: "database" }, { headers });
  } catch {
    return NextResponse.json({ status: "unavailable", check: "database" }, { status: 503, headers });
  }
}
