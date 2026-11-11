/**
 * Email transport contract for FUTURE recipient notifications. Nothing in this phase sends real email: the only implementation is the in-memory
 * FakeEmailTransport used by tests, and the server refuses to hand out any transport unless explicitly enabled AND a real provider is configured.
 *
 * Deliberately NOT assumed: that the provider deduplicates by key, that a timeout means "not sent", or that a webhook arrives exactly once.
 */
export type EmailMessage = { to: string; subject: string; text: string; html?: string; headers?: Record<string, string> };

export type SendResult =
  | { status: "accepted"; providerRef: string }
  /** The provider refused. `permanent` means this address will never work (suppress it); otherwise it may be retried later. */
  | { status: "rejected"; permanent: boolean; reason: string }
  /** Timeout or connection loss after the request may have reached the provider. The message may or may not have gone out: never resend blindly. */
  | { status: "uncertain"; reason: string };

export interface EmailTransport {
  readonly name: string;
  send(message: EmailMessage, ctx: { dedupeKey: string; timeoutMs: number }): Promise<SendResult>;
}

export type StatusEvent = { providerRef: string; kind: "delivered" | "bounced" | "complained" | "unsubscribed"; at: Date; permanent?: boolean };

/** Provider delivery-status callbacks (design only). Signatures must be verified before anything is parsed or trusted; events may repeat or arrive out of order. */
export interface EmailStatusReceiver {
  verifySignature(rawBody: string, headers: Headers): boolean;
  parse(rawBody: string): StatusEvent[];
}
