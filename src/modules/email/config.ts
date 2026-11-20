export type EmailEnv = {
  NODE_ENV?: string;
  MAWICA_ENV?: string;
  DATABASE_URL: string;
  EMAIL_PROVIDER?: "none" | "local-outbox" | "acs" | "resend";
  MAIL_LOCAL_OUTBOX?: string;
  ACS_EMAIL_ENDPOINT?: string;
  ACS_EMAIL_ACCESS_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM_AUTH?: string;
  MAWICA_DISABLE_EXTERNAL_EMAIL?: string;
  EMAIL_RECIPIENT_ALLOWLIST?: string;
  MAWICA_EMAIL_ALLOWLIST_REQUIRED?: string;
};

/**
 * Recipient allowlist (staging). null = no allowlist (every recipient allowed, as in production). A Set = ONLY these exact,
 * normalized addresses may receive any email. When MAWICA_EMAIL_ALLOWLIST_REQUIRED=1, a missing, empty or malformed list is a
 * problem and resolves to an EMPTY Set: nothing is sent to anyone (fail closed). Entries are never echoed in problems.
 */
export type Allowlist = { required: boolean; recipients: ReadonlySet<string> | null; problems: string[] };

/** The same normalization the auth route applies (trim + lowercase); no provider-specific tricks such as stripping "+tags". */
export const normalizeRecipient = (a: string) => a.trim().toLowerCase();
const ADDRESS = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

export function resolveAllowlist(e: Pick<EmailEnv, "EMAIL_RECIPIENT_ALLOWLIST" | "MAWICA_EMAIL_ALLOWLIST_REQUIRED">): Allowlist {
  const required = e.MAWICA_EMAIL_ALLOWLIST_REQUIRED === "1";
  const raw = e.EMAIL_RECIPIENT_ALLOWLIST;
  if (raw === undefined || raw.trim() === "") {
    return required ? { required, recipients: new Set(), problems: ["EMAIL_RECIPIENT_ALLOWLIST is required but missing or empty"] } : { required, recipients: null, problems: [] };
  }
  const entries = raw.split(/[,\n]/).map(normalizeRecipient).filter(Boolean);
  const bad = entries.filter((x) => !ADDRESS.test(x)).length;
  if (bad || entries.length === 0) return { required, recipients: new Set(), problems: [`EMAIL_RECIPIENT_ALLOWLIST has ${bad || "no"} invalid entr${bad === 1 ? "y" : "ies"}`] };
  return { required, recipients: new Set(entries), problems: [] };
}

export type EmailConfig =
  | { provider: "none"; problems: string[] }
  | { provider: "local-outbox"; outboxPath: string; problems: string[] }
  | { provider: "acs"; endpoint: string; accessKey: string; from: string; problems: string[] }
  | { provider: "resend"; apiKey: string; from: string; problems: string[] };

const LOOPBACK = ["localhost", "127.0.0.1", "::1", "[::1]"];

/** The local outbox holds readable one-time codes, so it exists only for development/test or an explicitly marked local run. */
export function localOutboxAllowed(e: Pick<EmailEnv, "NODE_ENV" | "MAWICA_ENV" | "DATABASE_URL">): boolean {
  if (e.NODE_ENV !== "production") return true;
  try { return e.MAWICA_ENV === "local" && LOOPBACK.includes(new URL(e.DATABASE_URL).hostname); } catch { return false; }
}

const FROM = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/**
 * Pure resolution + validation. Never throws and never falls back silently: if the requested provider cannot run,
 * the result is provider "none" with problems, and sending fails closed. Problems never contain secret values.
 */
export function resolveEmailConfig(e: EmailEnv): EmailConfig {
  const production = e.NODE_ENV === "production";
  const requested = e.EMAIL_PROVIDER ?? (localOutboxAllowed(e) ? "local-outbox" : "none");
  if (requested === "none") return { provider: "none", problems: production ? ["EMAIL_PROVIDER is not configured"] : [] };

  if (requested === "local-outbox") {
    if (!localOutboxAllowed(e)) return { provider: "none", problems: ["local-outbox is not allowed in production (needs MAWICA_ENV=local and a loopback database)"] };
    return { provider: "local-outbox", outboxPath: e.MAIL_LOCAL_OUTBOX ?? ".local-mail/outbox.jsonl", problems: [] };
  }

  const problems: string[] = [];
  if (requested === "resend") {
    // Resend keys are "re_" + random characters. Shape check only (catches empty/placeholder/pasted-wrong values); never echoed.
    if (!e.RESEND_API_KEY || !/^re_[A-Za-z0-9_-]{16,}$/.test(e.RESEND_API_KEY)) problems.push("RESEND_API_KEY is missing or malformed");
    if (!e.EMAIL_FROM_AUTH || !FROM.test(e.EMAIL_FROM_AUTH)) problems.push("EMAIL_FROM_AUTH must be a plain sender address");
    if (e.MAWICA_DISABLE_EXTERNAL_EMAIL === "1") problems.push("external email is disabled by MAWICA_DISABLE_EXTERNAL_EMAIL");
    if (problems.length) return { provider: "none", problems };
    return { provider: "resend", apiKey: e.RESEND_API_KEY!, from: e.EMAIL_FROM_AUTH!, problems: [] };
  }

  let endpoint = "";
  try { const u = new URL(e.ACS_EMAIL_ENDPOINT ?? ""); if (u.protocol !== "https:" || !u.hostname.endsWith(".communication.azure.com") && !u.hostname.endsWith(".azure.com")) problems.push("ACS_EMAIL_ENDPOINT must be an https *.communication.azure.com URL"); endpoint = u.origin; } catch { problems.push("ACS_EMAIL_ENDPOINT is missing or invalid"); }
  if (!e.ACS_EMAIL_ACCESS_KEY || e.ACS_EMAIL_ACCESS_KEY.length < 16) problems.push("ACS_EMAIL_ACCESS_KEY is missing");
  else if (!/^[A-Za-z0-9+/]+={0,2}$/.test(e.ACS_EMAIL_ACCESS_KEY)) problems.push("ACS_EMAIL_ACCESS_KEY is not base64");
  if (!e.EMAIL_FROM_AUTH || !FROM.test(e.EMAIL_FROM_AUTH)) problems.push("EMAIL_FROM_AUTH must be a plain sender address");
  if (e.MAWICA_DISABLE_EXTERNAL_EMAIL === "1") problems.push("external email is disabled by MAWICA_DISABLE_EXTERNAL_EMAIL");
  if (problems.length) return { provider: "none", problems };
  return { provider: "acs", endpoint, accessKey: e.ACS_EMAIL_ACCESS_KEY!, from: e.EMAIL_FROM_AUTH!, problems: [] };
}
