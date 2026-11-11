import "server-only";
import { z } from "zod";
import { allowedOrigins } from "@/lib/auth";
import { isAllowedOrigin } from "@/modules/auth/request";
import { getRequestUser, type SessionUser } from "@/modules/auth/session";
import { hashFor } from "@/modules/security/client-hash";
import { hit } from "@/modules/security/rate-limit";
import { IdempotencyKeyReuseError, InsufficientCreditsError } from "@/modules/wallet/engine";
import { ScheduleConflictError, ScheduleNotFoundError, ScheduleValidationError } from "./service";

const noStore = { "Cache-Control": "no-store" };
export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...noStore, ...extra } });

/**
 * Shared guard for every scheduling route: (mutations) the browser Origin must be ours, the session must be valid (the user always comes
 * from the session, never from the request), and a per-user rate limit applies. Returns the user or a ready-made refusal Response.
 */
export async function authorize(request: Request, opts: { mutating: boolean; bucket: string; limit: number }): Promise<{ user: SessionUser } | { response: Response }> {
  if (opts.mutating && !isAllowedOrigin(request.headers, allowedOrigins)) return { response: json({ error: "Forbidden" }, 403) };
  const user = await getRequestUser(request).catch(() => null);
  if (!user) return { response: json({ error: "Sign in required", code: "SIGN_IN_REQUIRED" }, 401) };
  const rl = await hit(hashFor(`sched-${opts.bucket}`, user.id), opts.limit, 3600);
  if (!rl.allowed) return { response: json({ error: "Too many requests. Please try again shortly." }, 429, { "Retry-After": String(rl.retryAfterSeconds) }) };
  return { user };
}

export async function readJson(request: Request, max: number): Promise<{ body: unknown } | { response: Response }> {
  if (!request.headers.get("content-type")?.includes("application/json")) return { response: json({ error: "Unsupported content type" }, 415) };
  const raw = await request.text();
  if (raw.length > max) return { response: json({ error: "Request too large" }, 413) };
  try { return { body: JSON.parse(raw) }; } catch { return { response: json({ error: "Invalid JSON" }, 400) }; }
}

export function zodErrors(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of e.issues) out[i.path.join(".") || "form"] ??= i.message;
  return out;
}

/** Maps domain errors to safe responses. Unknown errors become a generic 500 and are never echoed. */
export function errorResponse(e: unknown): Response {
  if (e instanceof ScheduleValidationError) return json({ error: e.message, code: e.code, details: e.details }, 422);
  if (e instanceof InsufficientCreditsError) return json({ error: e.unit === "PREMIUM" ? "You don't have a premium credit available." : "You've used all your cards for this month.", code: e.unit === "PREMIUM" ? "INSUFFICIENT_PREMIUM_CREDITS" : "INSUFFICIENT_CREDITS" }, 402);
  if (e instanceof IdempotencyKeyReuseError) return json({ error: "That request key was already used for a different request.", code: "IDEMPOTENCY_KEY_REUSED" }, 422);
  if (e instanceof ScheduleNotFoundError) return json({ error: "Not found" }, 404);
  if (e instanceof ScheduleConflictError) return json({ error: e.message, code: e.code, details: e.details }, 409);
  console.error("scheduling request failed"); // generic on purpose: no identifiers or content in logs
  return json({ error: "Something went wrong. Please try again." }, 500);
}
