import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { CLIENT_IP_HEADER, normalizeEmail } from "@/modules/auth/request";
import { recordAudit } from "@/modules/auth/audit";
import { getRequestUser } from "@/modules/auth/session";
import { trackEmailSend } from "@/modules/email/send-signal";
import { clientIp, hashFor } from "@/modules/security/client-hash";
import { hit } from "@/modules/security/rate-limit";

const handlers = toNextJsHandler(auth);

/**
 * Deny by default: Better Auth exposes many endpoints (and its plugins add more). Only what Mawica's UI uses is reachable.
 * Everything else is a plain 404, so unused flows (verify-email, reset, change-email, ...) cannot be probed or abused.
 */
const ALLOWED = {
  GET: new Set(["/ok"]),
  POST: new Set(["/email-otp/send-verification-otp", "/sign-in/email-otp", "/sign-out"]),
} as const;
const MAX_BODY = 2048;

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });
const tooMany = (retryAfter: number) => json({ error: "Too many attempts. Please wait and try again." }, 429, { "Retry-After": String(retryAfter) });

// Our own limits sit on top of Better Auth's per-IP rule: they also stop one victim's inbox being flooded from many IPs.
const LIMITS = {
  sendPerEmail: { limit: 5, window: 3600 },
  sendPerIp: { limit: 20, window: 3600 },
  sendGlobal: { limit: 1000, window: 3600 },
  verifyPerEmail: { limit: 20, window: 3600 },
};

/** Rebuilds the request (never `new Request(nextRequest)`: that throws in the Next runtime) with a trusted client-IP header. */
function forwarded(req: Request, method: string, body: string | undefined, ip: string): Request {
  const headers = new Headers(req.headers);
  headers.delete(CLIENT_IP_HEADER); // never trust a client-supplied value
  headers.set(CLIENT_IP_HEADER, ip);
  if (body !== undefined) { headers.set("content-type", "application/json"); headers.delete("content-length"); }
  return new Request(req.url, { method, headers, body, redirect: "manual" });
}

async function handle(req: Request, method: "GET" | "POST") {
  const path = new URL(req.url).pathname.replace(/^\/api\/auth/, "") || "/";
  if (!ALLOWED[method].has(path)) return json({ error: "Not found" }, 404);
  const ip = clientIp(req.headers);

  if (method === "GET") return handlers.GET(forwarded(req, "GET", undefined, ip));

  if (!req.headers.get("content-type")?.includes("application/json")) return json({ error: "Unsupported content type" }, 415);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: "Request too large" }, 413);
  let body: Record<string, unknown> = {};
  if (raw.trim()) {
    try { const p = JSON.parse(raw); if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error(); body = p as Record<string, unknown>; } catch { return json({ error: "Invalid JSON" }, 400); }
  }

  let outgoing = raw;
  if (path === "/email-otp/send-verification-otp" || path === "/sign-in/email-otp") {
    const email = normalizeEmail(body.email);
    // Same response whether or not the address is valid-looking or known: no account-existence signal.
    if (!email) return json({ error: "Enter a valid email address." }, 400);
    if (path === "/email-otp/send-verification-otp") {
      if (body.type !== "sign-in") return json({ error: "Not found" }, 404);
      const [byEmail, byIp, global] = await Promise.all([
        hit(hashFor("otp-send-email", email), LIMITS.sendPerEmail.limit, LIMITS.sendPerEmail.window),
        hit(hashFor("otp-send-ip", ip), LIMITS.sendPerIp.limit, LIMITS.sendPerIp.window),
        hit("otp-send:global", LIMITS.sendGlobal.limit, LIMITS.sendGlobal.window),
      ]);
      const blocked = [byEmail, byIp, global].find((r) => !r.allowed);
      if (blocked) return tooMany(blocked.retryAfterSeconds);
      outgoing = JSON.stringify({ email, type: "sign-in" });
    } else {
      const r = await hit(hashFor("otp-verify-email", email), LIMITS.verifyPerEmail.limit, LIMITS.verifyPerEmail.window);
      if (!r.allowed) return tooMany(r.retryAfterSeconds);
      if (typeof body.otp !== "string" || !/^\d{6}$/.test(body.otp)) return json({ message: "Invalid OTP", code: "INVALID_OTP" }, 400);
      outgoing = JSON.stringify({ email, otp: body.otp });
    }
  }

  const user = path === "/sign-out" ? await getRequestUser(req).catch(() => null) : null;
  const { result: res, failed: emailFailed } = await trackEmailSend(() => handlers.POST(forwarded(req, "POST", outgoing, ip)));
  if (path === "/sign-out" && res.ok && user) await recordAudit("auth.sign_out", { userId: user.id, ip });

  // The code could not be emailed (provider off, throttled or failing): same generic answer for every address, no detail leaked.
  if (path === "/email-otp/send-verification-otp" && (emailFailed || res.status >= 500)) {
    await res.body?.cancel().catch(() => {});
    return json({ error: "We couldn't send a sign-in code right now. Please try again in a few minutes." }, 503, { "Retry-After": "60" });
  }

  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "no-store");
  return out;
}

export const GET = (req: Request) => handle(req, "GET");
export const POST = (req: Request) => handle(req, "POST");
