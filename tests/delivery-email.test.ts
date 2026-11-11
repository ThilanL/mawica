import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkEmailEligibility, emailDeliveryEnabled, type EligibilityInput } from "@/modules/delivery/email/eligibility";
import { attemptSend } from "@/modules/delivery/email/send";
import { FakeEmailTransport } from "@/modules/delivery/email/fake";
import { getEmailTransport } from "@/modules/delivery/email";
import { planSenderReminder } from "@/modules/delivery/reminders";
import { LINK_DELIVERY_NOTICE } from "@/modules/delivery/notices";

const ok: EligibilityInput = { emailEnabled: true, transportConfigured: true, scheduleChannel: "EMAIL", recipient: { email: "r@example.com", consentStatus: "GRANTED", senderAttestedAt: new Date(), suppressed: false } };
type Rec = NonNullable<EligibilityInput["recipient"]>;
const without = (over: { emailEnabled?: boolean; transportConfigured?: boolean; scheduleChannel?: "LINK" | "EMAIL"; recipient?: Partial<Rec> | null }): EligibilityInput => ({
  emailEnabled: over.emailEnabled ?? ok.emailEnabled,
  transportConfigured: over.transportConfigured ?? ok.transportConfigured,
  scheduleChannel: over.scheduleChannel ?? ok.scheduleChannel,
  recipient: over.recipient === null ? null : { ...ok.recipient!, ...(over.recipient ?? {}) },
});

describe("email eligibility gate (nothing is ever sent in this phase)", () => {
  it("is eligible only when every condition holds", () => expect(checkEmailEligibility(ok)).toEqual({ eligible: true, reasons: [] }));
  it("is OFF by default and getEmailTransport() hands out nothing, even when enabled (no provider exists yet)", () => {
    expect(emailDeliveryEnabled({})).toBe(false);
    expect(emailDeliveryEnabled({ EMAIL_DELIVERY_ENABLED: "true" })).toBe(false);
    expect(emailDeliveryEnabled({ EMAIL_DELIVERY_ENABLED: "1" })).toBe(true);
    expect(getEmailTransport()).toBeNull();
    process.env.EMAIL_DELIVERY_ENABLED = "1";
    try { expect(getEmailTransport()).toBeNull(); } finally { delete process.env.EMAIL_DELIVERY_ENABLED; }
    expect(checkEmailEligibility(without({ emailEnabled: false })).reasons).toContain("EMAIL_DELIVERY_DISABLED");
    expect(checkEmailEligibility(without({ transportConfigured: false })).reasons).toContain("NO_TRANSPORT");
  });
  it("the sender's attestation is NOT recipient consent: attestation without consent is refused, in every consent state but GRANTED", () => {
    for (const consentStatus of ["NONE", "REQUESTED", "WITHDRAWN"] as const) {
      const r = checkEmailEligibility(without({ recipient: { consentStatus, senderAttestedAt: new Date() } }));
      expect(r.eligible).toBe(false);
      expect(r.reasons).toContain("RECIPIENT_CONSENT_MISSING");
    }
  });
  it("recipient consent without the sender's attestation is refused too (both facts are required)", () => {
    expect(checkEmailEligibility(without({ recipient: { senderAttestedAt: null } })).reasons).toEqual(["SENDER_ATTESTATION_MISSING"]);
  });
  it("a LINK schedule is never converted to EMAIL, even for a fully consenting recipient", () => {
    expect(checkEmailEligibility(without({ scheduleChannel: "LINK" })).reasons).toEqual(["CHANNEL_NOT_EMAIL"]);
  });
  it("refuses missing recipients, missing addresses and suppressed addresses (bounce, complaint, unsubscribe)", () => {
    expect(checkEmailEligibility(without({ recipient: null })).reasons).toEqual(["NO_RECIPIENT"]);
    expect(checkEmailEligibility(without({ recipient: { email: null } })).reasons).toEqual(["NO_EMAIL_ADDRESS"]);
    expect(checkEmailEligibility(without({ recipient: { suppressed: true } })).reasons).toEqual(["ADDRESS_SUPPRESSED"]);
  });
  it("reports every failing reason at once", () => {
    expect(checkEmailEligibility({ emailEnabled: false, transportConfigured: false, scheduleChannel: "LINK", recipient: null }).reasons).toEqual(["EMAIL_DELIVERY_DISABLED", "NO_TRANSPORT", "CHANNEL_NOT_EMAIL", "NO_RECIPIENT"]);
  });
});

describe("provider abstraction with the fake transport", () => {
  const msg = { to: "r@example.com", subject: "s", text: "t" };
  const ctx = { dedupeKey: "delivery-1", timeoutMs: 5000 };
  it("accepted sends are done; permanent rejections suppress the address; temporary rejections retry later", async () => {
    const t = new FakeEmailTransport();
    expect(await attemptSend(t, msg, ctx)).toEqual({ action: "DONE", providerRef: "fake-1" });
    t.mode = "reject-permanent"; expect(await attemptSend(t, msg, ctx)).toMatchObject({ action: "SUPPRESS_ADDRESS" });
    t.mode = "reject-temporary"; expect(await attemptSend(t, msg, ctx)).toMatchObject({ action: "RETRY_LATER" });
  });
  it("an uncertain outcome (timeout, throw) is NEVER retried automatically: it must be reconciled first", async () => {
    for (const mode of ["timeout-after-send", "timeout-before-send", "throw"] as const) {
      const t = new FakeEmailTransport(); t.mode = mode;
      expect((await attemptSend(t, msg, ctx)).action).toBe("RECONCILE_BEFORE_ANY_RETRY");
    }
  });
  it("demonstrates the duplicate-notification risk of retrying an uncertain send when the provider does not deduplicate", async () => {
    const naive = new FakeEmailTransport(false); naive.mode = "timeout-after-send";
    await attemptSend(naive, msg, ctx);
    naive.mode = "accept";
    await attemptSend(naive, msg, ctx); // what a blind retry would do
    expect(naive.outbox).toHaveLength(2); // the recipient got two emails
    const careful = new FakeEmailTransport(true); careful.mode = "timeout-after-send";
    await attemptSend(careful, msg, ctx); careful.mode = "accept"; await attemptSend(careful, msg, ctx);
    expect(careful.outbox).toHaveLength(1); // only a provider that honours the key protects us: we do not assume it
  });
  it("the delivery worker has no dependency on the email module", () => {
    expect(readFileSync("src/modules/delivery/queue.ts", "utf8")).not.toMatch(/from ["']\.\/email/);
    expect(readFileSync("src/modules/delivery/index.ts", "utf8")).not.toMatch(/email/);
  });
});

describe("LINK wording and sender reminders (design only)", () => {
  it("states exactly what LINK delivery does", () => expect(LINK_DELIVERY_NOTICE).toBe("Your card will become available at the scheduled time. You will need to share the link with your recipient."));
  it("the UI never claims LINK delivery sends a notification", () => {
    for (const f of ["src/components/schedule/SchedulePanel.tsx", "src/components/schedule/ScheduledList.tsx", "src/modules/delivery/notices.ts"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/we(?:'| wi)ll (?:email|notify|send)|automatically (?:sent|emailed|notified)|recipient will (?:be notified|receive an email)/i);
    }
  });
  it("plans a sender reminder only for the future and only when enabled; it is a pure calculation (nothing is sent)", () => {
    const now = new Date("2026-11-11T00:00:00Z"), at = new Date("2026-11-15T09:00:00Z");
    expect(planSenderReminder({ deliverAtUtc: at, leadHours: 24, enabled: true, now })?.toISOString()).toBe("2026-11-14T09:00:00.000Z");
    expect(planSenderReminder({ deliverAtUtc: at, leadHours: 24, enabled: false, now })).toBeNull();
    expect(planSenderReminder({ deliverAtUtc: at, leadHours: 24 * 10, enabled: true, now })).toBeNull(); // would be in the past
    expect(planSenderReminder({ deliverAtUtc: at, leadHours: 0, enabled: true, now })).toBeNull();
  });
});
