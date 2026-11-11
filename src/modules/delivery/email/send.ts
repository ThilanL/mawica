import type { EmailMessage, EmailTransport, SendResult } from "./types";

/** What the caller must do with the outcome of one send attempt. */
export type SendAction =
  | { action: "DONE"; providerRef: string }
  | { action: "SUPPRESS_ADDRESS"; reason: string } // permanent rejection: never try this address again
  | { action: "RETRY_LATER"; reason: string } // clean temporary rejection (the provider says it did NOT accept the message)
  | { action: "RECONCILE_BEFORE_ANY_RETRY"; reason: string }; // uncertain: the message may already be out; wait for the provider's status or a human, never resend automatically

/**
 * Safe handling of one provider call. Because a timeout is NOT proof of non-delivery and the provider's deduplication is not assumed, an uncertain
 * result is never retried automatically: that would risk sending the recipient two notifications.
 */
export async function attemptSend(transport: EmailTransport, message: EmailMessage, ctx: { dedupeKey: string; timeoutMs: number }): Promise<SendAction> {
  let res: SendResult;
  try { res = await transport.send(message, ctx); } catch (e) { return { action: "RECONCILE_BEFORE_ANY_RETRY", reason: e instanceof Error ? e.name : "error" }; } // a throw after the request began is uncertain too
  switch (res.status) {
    case "accepted": return { action: "DONE", providerRef: res.providerRef };
    case "rejected": return res.permanent ? { action: "SUPPRESS_ADDRESS", reason: res.reason } : { action: "RETRY_LATER", reason: res.reason };
    default: return { action: "RECONCILE_BEFORE_ANY_RETRY", reason: res.reason };
  }
}
