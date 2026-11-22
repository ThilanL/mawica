import "server-only";
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";

export type StaffAuditAction =
  | "staff.sign_in"
  | "staff.sign_out"
  | "moderation.card_removed"
  | "moderation.report_viewed"
  | "support.customer_viewed"
  | "ops.dashboard_viewed"
  | "ops.export_downloaded";

/**
 * Admin audit writer. Never store emails, message bodies, tokens, or raw IPs in meta.
 * Failures are logged generically and never block the staff action's primary effect
 * when called with `bestEffort: true` (default for sign-in); moderation writes should await and surface errors.
 */
export async function recordStaffAudit(
  action: StaffAuditAction,
  opts: {
    staffPrincipalId: string;
    ip?: string | null;
    rateLimitSalt: string;
    meta?: Record<string, string | number | boolean | null>;
    bestEffort?: boolean;
  },
): Promise<void> {
  const write = () =>
    db.auditLog.create({
      data: {
        action,
        staffPrincipalId: opts.staffPrincipalId,
        actorId: null,
        ipHash: opts.ip ? hashIp(opts.rateLimitSalt, opts.ip) : null,
        meta: opts.meta ?? undefined,
      },
    });

  if (opts.bestEffort === false) {
    await write();
    return;
  }
  try {
    await write();
  } catch {
    console.error(`staff audit write failed (${action})`);
  }
}

function hashIp(salt: string, ip: string): string {
  return createHmac("sha256", salt).update(`audit|${ip}`).digest("hex");
}
