import "server-only";

/**
 * Structured, allow-listed webhook logging. Only these fields can ever be written: no payload, no signature header, no secrets,
 * no customer names, emails or amounts. Unknown keys passed by a caller are dropped, not logged.
 */
const ALLOWED = ["eventId", "type", "status", "outcome", "livemode", "attempts", "durationMs", "code", "errorName"] as const;
type Field = (typeof ALLOWED)[number];
export type WebhookLogFields = Partial<Record<Field, string | number | boolean | null>>;

export function sanitizeLogFields(fields: Record<string, unknown>): WebhookLogFields {
  const out: WebhookLogFields = {};
  for (const key of ALLOWED) {
    const v = fields[key];
    if (v === undefined) continue;
    if (typeof v === "number" || typeof v === "boolean" || v === null) out[key] = v;
    else if (typeof v === "string") out[key] = v.replace(/(sk|rk|pk)_(test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9+/=_-]+/g, "[redacted]").slice(0, 120);
  }
  return out;
}

export function logWebhook(level: "info" | "warn" | "error", message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ scope: "stripe_webhook", message, ...sanitizeLogFields(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
