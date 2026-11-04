import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createCardSchema } from "@/modules/cards/schema";
import { createCard } from "@/modules/cards/service";
import { clientIp, hashFor } from "@/modules/security/client-hash";
import { hit } from "@/modules/security/rate-limit";

const PER_IP = { limit: 5, windowSeconds: 3600 };
const GLOBAL = { limit: 2000, windowSeconds: 86400 };
const ATTEMPTS = { limit: 60, windowSeconds: 3600 };
const MAX_BODY = 4096;

const tooMany = (retryAfter: number) =>
  NextResponse.json({ error: "Too many cards created. Please try again later." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Request too large" }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ip = clientIp(request.headers);
  // Cheap guard against request floods (counts every attempt, including invalid ones).
  const attempts = await hit(hashFor("attempt", ip), ATTEMPTS.limit, ATTEMPTS.windowSeconds);
  if (!attempts.allowed) return tooMany(attempts.retryAfterSeconds);

  const parsed = createCardSchema.safeParse(body);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
    return NextResponse.json({ errors }, { status: 400 });
  }
  // Honeypot: pretend success so bots learn nothing, but store nothing and spend no quota.
  if (parsed.data.website) return NextResponse.json({ slug: "bot", url: env.NEXT_PUBLIC_SITE_URL }, { status: 201 });

  // Publish quota only counts valid submissions, so typos never burn it.
  const [perIp, global] = await Promise.all([
    hit(hashFor("publish", ip), PER_IP.limit, PER_IP.windowSeconds),
    hit("publish:global", GLOBAL.limit, GLOBAL.windowSeconds),
  ]);
  const blocked = [perIp, global].find((r) => !r.allowed);
  if (blocked) return tooMany(blocked.retryAfterSeconds);

  const { slug } = await createCard(parsed.data);
  return NextResponse.json({ slug, url: `${env.NEXT_PUBLIC_SITE_URL}/c/${slug}` }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
