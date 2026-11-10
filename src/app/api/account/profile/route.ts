import { allowedOrigins } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAllowedOrigin, profileUpdateSchema } from "@/modules/auth/request";
import { recordAudit } from "@/modules/auth/audit";
import { getRequestUser } from "@/modules/auth/session";
import { clientIp, hashFor } from "@/modules/security/client-hash";
import { hit } from "@/modules/security/rate-limit";

const noStore = { "Cache-Control": "no-store" };
const json = (b: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(b, { status, headers: { ...noStore, ...extra } });

// The user id ALWAYS comes from the validated session. These routes accept no user id, so one account cannot address another.
async function currentProfile(userId: string, email: string, emailVerified: boolean) {
  const p = await db.profile.upsert({ where: { userId }, update: {}, create: { userId, termsAcceptedAt: new Date() }, select: { displayName: true, timeZone: true } });
  return { email, emailVerified, displayName: p.displayName, timeZone: p.timeZone };
}

export async function GET(request: Request) {
  const user = await getRequestUser(request).catch(() => null);
  if (!user) return json({ error: "Sign in required" }, 401);
  return json(await currentProfile(user.id, user.email, user.emailVerified));
}

export async function PATCH(request: Request) {
  if (!isAllowedOrigin(request.headers, allowedOrigins)) return json({ error: "Forbidden" }, 403);
  const user = await getRequestUser(request).catch(() => null);
  if (!user) return json({ error: "Sign in required" }, 401);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "Unsupported content type" }, 415);

  const rl = await hit(hashFor("profile", user.id), 30, 3600);
  if (!rl.allowed) return json({ error: "Too many changes. Please try again later." }, 429, { "Retry-After": String(rl.retryAfterSeconds) });

  const raw = await request.text();
  if (raw.length > 2048) return json({ error: "Request too large" }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
    return json({ errors }, 400);
  }
  const { displayName, timeZone } = parsed.data;
  await db.profile.upsert({
    where: { userId: user.id },
    update: { ...(displayName !== undefined && { displayName: displayName || null }), ...(timeZone && { timeZone }) },
    create: { userId: user.id, termsAcceptedAt: new Date(), displayName: displayName || null, ...(timeZone && { timeZone }) },
  });
  await recordAudit("account.profile_updated", { userId: user.id, ip: clientIp(request.headers), meta: { fields: Object.keys(parsed.data) } });
  return json(await currentProfile(user.id, user.email, user.emailVerified));
}
