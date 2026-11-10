import { z } from "zod";

/** Header the auth route wrapper sets from Mawica's own trusted-proxy logic. Client-supplied copies are always discarded. */
export const CLIENT_IP_HEADER = "x-mawica-client-ip";

const emailSchema = z.string().max(254).transform((s) => s.normalize("NFKC").trim().toLowerCase()).pipe(z.email());

/** Canonical form used for every rate-limit key and every lookup. Returns null when it is not a plausible address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const r = emailSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Origins allowed to call state-changing endpoints (our own routes use this; Better Auth checks its own with the same list). */
export function parseOrigins(base: string, extra?: string): string[] {
  const out = new Set<string>([new URL(base).origin]);
  for (const o of (extra ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    try { out.add(new URL(o).origin); } catch { /* ignore malformed entry */ }
  }
  return [...out];
}

/** CSRF defence for our own mutating routes: the browser-sent Origin must be exactly one of ours. A missing Origin is refused. */
export function isAllowedOrigin(headers: Headers, allowed: string[]): boolean {
  const origin = headers.get("origin");
  return !!origin && allowed.includes(origin);
}

/** A cookie header contains a Better Auth session cookie (cheap check so anonymous visitors never cost a DB query). */
export const hasSessionCookie = (cookieHeader: string | null) => !!cookieHeader && /(^|;\s*)(__Secure-)?mawica\.session_token=/.test(cookieHeader);

const clean = (s: string) => s.normalize("NFC").replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim();

export function isValidTimeZone(tz: string): boolean {
  if (tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
}

export const profileUpdateSchema = z
  .object({
    displayName: z.union([z.null(), z.string().transform(clean).pipe(z.string().max(40, "Name must be 40 characters or fewer"))]).optional(),
    timeZone: z.string().refine(isValidTimeZone, "Choose a valid time zone").optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
