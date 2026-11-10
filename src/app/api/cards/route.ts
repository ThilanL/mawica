import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createCardSchema } from "@/modules/cards/schema";
import { createCard } from "@/modules/cards/service";
import { hasSessionCookie } from "@/modules/auth/request";
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

  // Signed-in users publish through the wallet; everyone else takes the unchanged guest path below.
  // Accounts and wallet are loaded lazily and only when a session cookie is present, so the guest flow never depends on them.
  if (hasSessionCookie(request.headers.get("cookie"))) {
    let user: { id: string; email: string; emailVerified: boolean } | null = null;
    try {
      const { getRequestUser } = await import("@/modules/auth/session");
      user = await getRequestUser(request);
    } catch {
      console.error("session check unavailable; treating the request as a guest"); // generic: no identifiers in logs
    }
    if (user) return publishSignedIn(request, user, parsed.data);
  }

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

/** Wallet-metered, account-owned publishing. Quotas are enforced here on the server, in the same transaction as the card insert. */
async function publishSignedIn(request: Request, user: { id: string; email: string; emailVerified: boolean }, data: { templateKey: string; recipientName: string; senderName: string; message: string }) {
  const { publishOwnedCard, IDEMPOTENCY_KEY_RE } = await import("@/modules/wallet/publish");
  const { InsufficientCreditsError, IdempotencyKeyReuseError } = await import("@/modules/wallet/engine");
  const headerKey = request.headers.get("idempotency-key");
  if (headerKey !== null && !IDEMPOTENCY_KEY_RE.test(headerKey)) return NextResponse.json({ error: "Invalid Idempotency-Key" }, { status: 400 });
  // Per account (not per IP: households and offices share addresses). The monthly allowance is the real limit; this only stops floods.
  const [perUser, global] = await Promise.all([hit(hashFor("publish-user", user.id), 120, 3600), hit("publish:global", GLOBAL.limit, GLOBAL.windowSeconds)]);
  const blocked = [perUser, global].find((r) => !r.allowed);
  if (blocked) return tooMany(blocked.retryAfterSeconds);
  try {
    const out = await publishOwnedCard(data as Parameters<typeof publishOwnedCard>[0], user, { idempotencyKey: headerKey ?? crypto.randomUUID() });
    return NextResponse.json({ slug: out.slug, url: `${env.NEXT_PUBLIC_SITE_URL}/c/${out.slug}`, owned: true, remaining: out.remaining }, { status: out.replay ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      let resetsAt: string | null = null;
      try { const { walletSummary } = await import("@/modules/wallet/wallet"); resetsAt = (await walletSummary(user)).period.nextReset; } catch { /* message still works without the date */ }
      return NextResponse.json({ error: "You've used all your cards for this month.", code: "INSUFFICIENT_CREDITS", resetsAt }, { status: 402, headers: { "Cache-Control": "no-store" } });
    }
    if (e instanceof IdempotencyKeyReuseError) return NextResponse.json({ error: "That request key was already used for a different card.", code: "IDEMPOTENCY_KEY_REUSED" }, { status: 422 });
    console.error("signed-in publish failed"); // generic on purpose
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
