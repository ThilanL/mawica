import { getRequestUser } from "@/modules/auth/session";
import { hashFor } from "@/modules/security/client-hash";
import { hit } from "@/modules/security/rate-limit";
import { walletActivity } from "@/modules/wallet/wallet";

const headers = { "Cache-Control": "no-store" };

/** Recent card activity of the signed-in user's own wallet (newest first). Optional `limit` (1-50) and `before` (ISO time) only page the list. */
export async function GET(request: Request) {
  const user = await getRequestUser(request).catch(() => null);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401, headers });
  const rl = await hit(hashFor("wallet", user.id), 120, 3600);
  if (!rl.allowed) return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429, headers: { ...headers, "Retry-After": String(rl.retryAfterSeconds) } });

  const sp = new URL(request.url).searchParams;
  const limitRaw = sp.get("limit");
  const beforeRaw = sp.get("before");
  const limit = limitRaw === null ? 20 : Number(limitRaw);
  const before = beforeRaw === null ? undefined : new Date(beforeRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (before && Number.isNaN(before.getTime()))) return Response.json({ error: "Invalid parameters" }, { status: 400, headers });
  try {
    return Response.json(await walletActivity(user.id, { limit, before }), { headers });
  } catch {
    console.error("wallet activity failed");
    return Response.json({ error: "We couldn't load your activity. Please try again." }, { status: 500, headers });
  }
}
