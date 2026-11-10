import "server-only";
import { db } from "@/lib/db";
import { hashFor } from "@/modules/security/client-hash";

export type AuditAction = "auth.user_created" | "auth.sign_in" | "auth.sign_out" | "account.profile_updated";

/**
 * Best-effort audit trail: a failed write never blocks the user action. Never pass emails, codes, tokens or message
 * text in `meta`; only short, non-sensitive facts (for example which profile fields changed).
 */
export async function recordAudit(action: AuditAction, opts: { userId?: string | null; ip?: string | null; meta?: Record<string, string | number | boolean | string[]> } = {}) {
  try {
    await db.auditLog.create({
      data: { action, actorId: opts.userId ?? null, ipHash: opts.ip ? hashFor("audit", opts.ip) : null, meta: opts.meta ?? undefined },
    });
  } catch {
    console.error(`audit write failed (${action})`); // generic on purpose: no identifiers in logs
  }
}
