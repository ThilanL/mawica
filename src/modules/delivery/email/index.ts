import "server-only";
import { emailDeliveryEnabled } from "./eligibility";
import type { EmailTransport } from "./types";

/**
 * Hands out the email transport for FUTURE use. Today it always returns null: there is no real provider implementation, nothing is configured, and
 * no code path in the delivery worker calls it. A provider (Azure Communication Services Email is the primary candidate) will be added behind this
 * function, and only when EMAIL_DELIVERY_ENABLED=1 and its server-side settings exist. See docs/delivery.md.
 */
export function getEmailTransport(): EmailTransport | null {
  if (!emailDeliveryEnabled()) return null;
  return null; // enabled but no provider implemented yet: still refuse
}
export { checkEmailEligibility, emailDeliveryEnabled } from "./eligibility";
export { attemptSend } from "./send";
export type { EmailMessage, EmailTransport, SendResult, StatusEvent, EmailStatusReceiver } from "./types";
