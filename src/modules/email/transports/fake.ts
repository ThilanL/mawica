import type { OutboundEmail, TransactionalTransport, TransportResult } from "../types";

/** In-memory transport for tests. */
export class FakeTransport implements TransactionalTransport {
  readonly name = "fake" as const;
  external = false;
  outbox: { message: OutboundEmail; operationId: string }[] = [];
  next: TransportResult | "throw" = { status: "accepted", providerRef: "fake-1" };
  async send(message: OutboundEmail, ctx: { operationId: string }): Promise<TransportResult> {
    if (this.next === "throw") throw new Error("boom to a@example.com");
    if (this.next.status === "accepted") this.outbox.push({ message, operationId: ctx.operationId });
    return this.next;
  }
}
