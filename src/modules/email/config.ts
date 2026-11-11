export type EmailEnv = {
  NODE_ENV?: string;
  MAWICA_ENV?: string;
  DATABASE_URL: string;
  EMAIL_PROVIDER?: "none" | "local-outbox" | "acs";
  MAIL_LOCAL_OUTBOX?: string;
  ACS_EMAIL_ENDPOINT?: string;
  ACS_EMAIL_ACCESS_KEY?: string;
  EMAIL_FROM_AUTH?: string;
  MAWICA_DISABLE_EXTERNAL_EMAIL?: string;
};

export type EmailConfig =
  | { provider: "none"; problems: string[] }
  | { provider: "local-outbox"; outboxPath: string; problems: string[] }
  | { provider: "acs"; endpoint: string; accessKey: string; from: string; problems: string[] };

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
  let endpoint = "";
  try { const u = new URL(e.ACS_EMAIL_ENDPOINT ?? ""); if (u.protocol !== "https:" || !u.hostname.endsWith(".communication.azure.com") && !u.hostname.endsWith(".azure.com")) problems.push("ACS_EMAIL_ENDPOINT must be an https *.communication.azure.com URL"); endpoint = u.origin; } catch { problems.push("ACS_EMAIL_ENDPOINT is missing or invalid"); }
  if (!e.ACS_EMAIL_ACCESS_KEY || e.ACS_EMAIL_ACCESS_KEY.length < 16) problems.push("ACS_EMAIL_ACCESS_KEY is missing");
  else if (!/^[A-Za-z0-9+/]+={0,2}$/.test(e.ACS_EMAIL_ACCESS_KEY)) problems.push("ACS_EMAIL_ACCESS_KEY is not base64");
  if (!e.EMAIL_FROM_AUTH || !FROM.test(e.EMAIL_FROM_AUTH)) problems.push("EMAIL_FROM_AUTH must be a plain sender address");
  if (e.MAWICA_DISABLE_EXTERNAL_EMAIL === "1") problems.push("external email is disabled by MAWICA_DISABLE_EXTERNAL_EMAIL");
  if (problems.length) return { provider: "none", problems };
  return { provider: "acs", endpoint, accessKey: e.ACS_EMAIL_ACCESS_KEY!, from: e.EMAIL_FROM_AUTH!, problems: [] };
}
