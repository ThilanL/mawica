import type { EmailPurpose } from "./types";

/**
 * Hard policy table. Enabling another purpose is a code change that needs product/legal sign-off (docs/email.md),
 * never a runtime flag: recipient mail needs the consent gate (modules/delivery/email/eligibility.ts) and a lawful basis.
 */
export const PURPOSE_POLICY: Record<EmailPurpose, { enabled: boolean; fromEnv: "EMAIL_FROM_AUTH"; why: string }> = {
  "auth-code": { enabled: true, fromEnv: "EMAIL_FROM_AUTH", why: "account sign-in one-time codes (requested by the address owner)" },
  "sender-notification": { enabled: false, fromEnv: "EMAIL_FROM_AUTH", why: "delivery notices to senders: pending product approval" },
  "recipient-greeting": { enabled: false, fromEnv: "EMAIL_FROM_AUTH", why: "greeting delivery to recipients: pending consent design and legal approval" },
};
