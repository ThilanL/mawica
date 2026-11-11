import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { OutboundEmail, TransactionalTransport } from "../types";

/** Dev/test only (config.ts gates it). Appends to a gitignored 0600 file so tests can read codes. Never networked, never logged. */
export class LocalOutboxTransport implements TransactionalTransport {
  readonly name = "local-outbox" as const;
  readonly external = false;
  constructor(private readonly file: string, private readonly meta: (m: OutboundEmail) => Record<string, unknown> = () => ({})) {}
  async send(m: OutboundEmail, ctx: { operationId: string }) {
    const file = path.resolve(this.file);
    await mkdir(path.dirname(file), { recursive: true });
    const otp = /\b(\d{6})\b/.exec(m.text)?.[1];
    await appendFile(file, JSON.stringify({ to: m.to, otp, subject: m.subject, at: new Date().toISOString(), ...this.meta(m) }) + "\n", { mode: 0o600 });
    return { status: "accepted" as const, providerRef: `local-${ctx.operationId}` };
  }
}
