/**
 * Provider-independent transactional email contract. Three PURPOSES are kept apart on purpose (see purposes.ts):
 * only "auth-code" is enabled in this phase. Recipient greeting delivery stays in modules/delivery (consent-gated, inert).
 */
export type EmailPurpose = "auth-code" | "sender-notification" | "recipient-greeting";

export type OutboundEmail = { to: string; subject: string; text: string; html?: string };

/** What a transport reports. "uncertain" = the request may have reached the provider: never assume "not sent". */
export type TransportResult =
  | { status: "accepted"; providerRef: string }
  | { status: "rejected"; permanent: boolean; code: string; retryAfterSeconds?: number }
  | { status: "uncertain"; code: string };

export interface TransactionalTransport {
  readonly name: "local-outbox" | "acs" | "fake";
  /** True when this transport leaves the machine (never for local-outbox/fake). */
  readonly external: boolean;
  send(message: OutboundEmail, ctx: { operationId: string; timeoutMs: number; from: string }): Promise<TransportResult>;
}

/** What callers see. Codes are stable and contain no recipient data. */
export type SendOutcome =
  | { ok: true; provider: string; providerRef: string }
  | { ok: false; reason: "disabled" | "unavailable" | "rate_limited" | "rejected" | "uncertain" | "invalid"; retryAfterSeconds?: number };
