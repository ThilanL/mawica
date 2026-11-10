import { getRequestUser } from "@/modules/auth/session";
import { hashFor } from "@/modules/security/client-hash";
import { hit } from "@/modules/security/rate-limit";
import { walletSummary } from "@/modules/wallet/wallet";

const headers = { "Cache-Control": "no-store" };

/**
 * The signed-in user's own wallet. Identity comes ONLY from the validated session: this route takes no account id, user id or
 * query parameters, so one user cannot address another's wallet. Responses carry no ledger, grant, reservation or idempotency ids.
 */
export async function GET(request: Request) {
  const user = await getRequestUser(request).catch(() => null);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401, headers });
  const rl = await hit(hashFor("wallet", user.id), 120, 3600);
  if (!rl.allowed) return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429, headers: { ...headers, "Retry-After": String(rl.retryAfterSeconds) } });
  try {
    return Response.json({ wallet: await walletSummary(user) }, { headers });
  } catch {
    console.error("wallet summary failed"); // generic: no identifiers in logs
    return Response.json({ error: "We couldn't load your wallet. Please try again." }, { status: 500, headers });
  }
}
