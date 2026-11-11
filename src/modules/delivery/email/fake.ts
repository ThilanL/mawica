import type { EmailMessage, EmailTransport, SendResult } from "./types";

/** In-memory transport for automated tests. Never networked. It does NOT deduplicate unless asked, mirroring a provider we cannot trust to. */
export class FakeEmailTransport implements EmailTransport {
  readonly name = "fake";
  readonly outbox: { message: EmailMessage; dedupeKey: string; providerRef: string }[] = [];
  mode: "accept" | "reject-permanent" | "reject-temporary" | "timeout-after-send" | "timeout-before-send" | "throw" = "accept";
  constructor(private readonly honorDedupe = false) {}
  async send(message: EmailMessage, ctx: { dedupeKey: string; timeoutMs: number }): Promise<SendResult> {
    if (this.mode === "reject-permanent") return { status: "rejected", permanent: true, reason: "mailbox does not exist" };
    if (this.mode === "reject-temporary") return { status: "rejected", permanent: false, reason: "try again later" };
    if (this.mode === "timeout-before-send") return { status: "uncertain", reason: "timeout" }; // the message did NOT go out, but the caller cannot know that
    if (this.mode === "throw") throw new Error("connection reset");
    if (this.honorDedupe) { const dup = this.outbox.find((o) => o.dedupeKey === ctx.dedupeKey); if (dup) return { status: "accepted", providerRef: dup.providerRef }; }
    const providerRef = `fake-${this.outbox.length + 1}`;
    this.outbox.push({ message, dedupeKey: ctx.dedupeKey, providerRef });
    if (this.mode === "timeout-after-send") return { status: "uncertain", reason: "timeout" }; // the message DID go out, the caller cannot know that either
    return { status: "accepted", providerRef };
  }
}
