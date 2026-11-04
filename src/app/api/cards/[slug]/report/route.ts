import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reportSchema, SLUG_RE } from "@/modules/cards/schema";
import { clientIp, hashFor } from "@/modules/security/client-hash";
import { hit } from "@/modules/security/rate-limit";

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ip = clientIp(request.headers);
  const rl = await hit(hashFor("report", ip), 10, 3600);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many reports" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } });
  }

  const raw = await request.text();
  if (raw.length > 2048) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid report" }, { status: 400 });

  const card = await db.card.findFirst({ where: { slug, status: "PUBLISHED" }, select: { id: true } });
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.report.create({
    data: { cardId: card.id, reason: parsed.data.reason, details: parsed.data.details || null, reporterHash: hashFor("report", ip) },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
