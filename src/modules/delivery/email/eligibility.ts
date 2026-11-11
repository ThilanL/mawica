/**
 * The ONLY gate that may ever allow a recipient-directed email. Pure and server-side. Every condition must hold:
 *  - email delivery is explicitly enabled (default OFF) and a real transport exists;
 *  - the schedule itself is an EMAIL schedule: a LINK schedule is never silently converted;
 *  - the recipient has an address, the SENDER attested they may contact this person, AND the RECIPIENT's own consent is GRANTED
 *    (the sender's attestation is a different fact and is never enough on its own);
 *  - the address is not suppressed (bounce, complaint or unsubscribe).
 */
export type ConsentStatus = "NONE" | "REQUESTED" | "GRANTED" | "WITHDRAWN";
export type EligibilityReason =
  | "EMAIL_DELIVERY_DISABLED" | "NO_TRANSPORT" | "CHANNEL_NOT_EMAIL" | "NO_RECIPIENT" | "NO_EMAIL_ADDRESS"
  | "SENDER_ATTESTATION_MISSING" | "RECIPIENT_CONSENT_MISSING" | "ADDRESS_SUPPRESSED";

export type EligibilityInput = {
  emailEnabled: boolean;
  transportConfigured: boolean;
  scheduleChannel: "LINK" | "EMAIL";
  recipient: { email: string | null; consentStatus: ConsentStatus; senderAttestedAt: Date | null; suppressed?: boolean } | null;
};

export function checkEmailEligibility(i: EligibilityInput): { eligible: boolean; reasons: EligibilityReason[] } {
  const reasons: EligibilityReason[] = [];
  if (!i.emailEnabled) reasons.push("EMAIL_DELIVERY_DISABLED");
  if (!i.transportConfigured) reasons.push("NO_TRANSPORT");
  if (i.scheduleChannel !== "EMAIL") reasons.push("CHANNEL_NOT_EMAIL");
  if (!i.recipient) reasons.push("NO_RECIPIENT");
  else {
    if (!i.recipient.email) reasons.push("NO_EMAIL_ADDRESS");
    if (!i.recipient.senderAttestedAt) reasons.push("SENDER_ATTESTATION_MISSING");
    if (i.recipient.consentStatus !== "GRANTED") reasons.push("RECIPIENT_CONSENT_MISSING");
    if (i.recipient.suppressed) reasons.push("ADDRESS_SUPPRESSED");
  }
  return { eligible: reasons.length === 0, reasons };
}

/** Email delivery stays off unless the operator sets EMAIL_DELIVERY_ENABLED=1. Even then nothing is sent until a real transport is implemented. */
export const emailDeliveryEnabled = (env: Record<string, string | undefined> = process.env) => env.EMAIL_DELIVERY_ENABLED === "1";
