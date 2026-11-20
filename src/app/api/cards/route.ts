import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createCardSchema } from "@/modules/cards/schema";
import { isAllowedOrigin, parseOrigins } from "@/modules/auth/request";
import { MediaError } from "@/modules/media/validate";
import { clientIp, hashFor } from "@/modules/security/client-hash";
import { hit } from "@/modules/security/rate-limit";

const GLOBAL = { limit: 2000, windowSeconds: 86400 };
const ATTEMPTS = { limit: 60, windowSeconds: 3600 };
const MAX_BODY = 4096;
/** Same origin list as scheduling, media and profile mutations (BETTER_AUTH_URL / site URL + AUTH_TRUSTED_ORIGINS). */
const allowedOrigins = parseOrigins(env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_SITE_URL, env.AUTH_TRUSTED_ORIGINS);

const noStore = { "Cache-Control": "no-store" };
const tooMany = (retryAfter: number) =>
  NextResponse.json({ error: "Too many cards created. Please try again later." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
const signInRequired = () =>
  NextResponse.json({ error: "Sign in to publish a card. Previews are always free.", code: "SIGN_IN_REQUIRED" }, { status: 401, headers: noStore });

/**
 * Publishes a new card for the signed-in account only. Guests may still preview in the create wizard; this route never
 * creates an ownerless card. Session, Origin and Idempotency-Key are required; ownership and credits come from the wallet
 * engine (loaded only after a session is confirmed).
 */
export async function POST(request: Request) {
  if (!isAllowedOrigin(request.headers, allowedOrigins)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
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

  // Fail closed: missing, expired, invalid or unreadable sessions never fall through to an anonymous insert.
  let user: { id: string; email: string; emailVerified: boolean } | null = null;
  try {
    const { getRequestUser } = await import("@/modules/auth/session");
    user = await getRequestUser(request);
  } catch {
    console.error("session check unavailable; refusing publish"); // generic: no identifiers in logs
    return signInRequired();
  }
  if (!user) return signInRequired();

  return publishSignedIn(request, user, parsed.data);
}

/** Wallet-metered, account-owned publishing. Quotas are enforced here on the server, in the same transaction as the card insert. */
async function publishSignedIn(request: Request, user: { id: string; email: string; emailVerified: boolean }, data: { templateKey: string; recipientName: string; senderName: string; message: string; mediaId?: string }) {
  const { publishOwnedCard, IDEMPOTENCY_KEY_RE } = await import("@/modules/wallet/publish");
  const { InsufficientCreditsError, IdempotencyKeyReuseError } = await import("@/modules/wallet/engine");
  const headerKey = request.headers.get("idempotency-key");
  if (!headerKey || !IDEMPOTENCY_KEY_RE.test(headerKey)) {
    return NextResponse.json({ error: "A valid Idempotency-Key header is required." }, { status: 400 });
  }
  // Per account (not per IP: households and offices share addresses). The monthly allowance is the real limit; this only stops floods.
  const [perUser, global] = await Promise.all([hit(hashFor("publish-user", user.id), 120, 3600), hit("publish:global", GLOBAL.limit, GLOBAL.windowSeconds)]);
  const blocked = [perUser, global].find((r) => !r.allowed);
  if (blocked) return tooMany(blocked.retryAfterSeconds);
  try {
    const out = await publishOwnedCard(data as Parameters<typeof publishOwnedCard>[0], user, { idempotencyKey: headerKey });
    return NextResponse.json({ slug: out.slug, url: `${env.NEXT_PUBLIC_SITE_URL}/c/${out.slug}`, owned: true, remaining: out.remaining, premiumRemaining: out.premiumRemaining }, { status: out.replay ? 200 : 201, headers: noStore });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      let resetsAt: string | null = null;
      try { const { walletSummary } = await import("@/modules/wallet/wallet"); resetsAt = (await walletSummary(user)).period.nextReset; } catch { /* message still works without the date */ }
      return NextResponse.json({ error: e.unit === "PREMIUM" ? "You don't have a premium credit available." : "You've used all your cards for this month.", code: e.unit === "PREMIUM" ? "INSUFFICIENT_PREMIUM_CREDITS" : "INSUFFICIENT_CREDITS", resetsAt }, { status: 402, headers: noStore });
    }
    if (e instanceof IdempotencyKeyReuseError) return NextResponse.json({ error: "That request key was already used for a different card.", code: "IDEMPOTENCY_KEY_REUSED" }, { status: 422 });
    if (e instanceof MediaError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: noStore });
    console.error("signed-in publish failed"); // generic on purpose
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
