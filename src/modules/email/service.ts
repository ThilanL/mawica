import { randomUUID } from "node:crypto";
import { PURPOSE_POLICY } from "./purposes";
import { resolveEmailConfig, type EmailConfig, type EmailEnv } from "./config";
import { AcsEmailTransport } from "./transports/acs";
import { LocalOutboxTransport } from "./transports/local-outbox";
import type { EmailPurpose, OutboundEmail, SendOutcome, TransactionalTransport } from "./types";

export type EmailLog = { event: "email.send"; purpose: EmailPurpose; provider: string; outcome: string; code?: string; ref?: string; ms: number };
export type Limiter = (key: string, limit: number, windowSeconds: number) => Promise<{ allowed: boolean; retryAfterSeconds: number }>;

/** Global caps for external providers, held below ACS's documented default of 30/min and 100/hour per subscription. */
export const EXTERNAL_CAPS = { perMinute: 20, perHour: 80 };
export const SEND_TIMEOUT_MS = 8000;

export type EmailService = {
  config: EmailConfig;
  send(purpose: EmailPurpose, message: OutboundEmail): Promise<SendOutcome>;
};

type Deps = { transport?: TransactionalTransport; limiter?: Limiter; log?: (l: EmailLog) => void; config?: EmailConfig; outboxMeta?: (m: OutboundEmail) => Record<string, unknown> };

const defaultLog = (l: EmailLog) => console.info(JSON.stringify(l)); // fields are fixed codes: no recipient, subject, body or code

export function buildTransport(config: EmailConfig, fetchImpl?: typeof fetch, outboxMeta?: Deps["outboxMeta"]): TransactionalTransport | null {
  if (config.provider === "local-outbox") return new LocalOutboxTransport(config.outboxPath, outboxMeta);
  if (config.provider === "acs") return new AcsEmailTransport({ endpoint: config.endpoint, accessKey: config.accessKey }, fetchImpl);
  return null;
}

/** Pure factory (everything injectable) so tests never touch a network or a database. */
export function createEmailService(env: EmailEnv, deps: Deps = {}): EmailService {
  const config = deps.config ?? resolveEmailConfig(env);
  const transport = deps.transport ?? buildTransport(config, undefined, deps.outboxMeta);
  const log = deps.log ?? defaultLog;
  const from = config.provider === "acs" ? config.from : env.EMAIL_FROM_AUTH ?? "noreply@localhost.invalid";

  return {
    config,
    async send(purpose, message) {
      const t0 = Date.now();
      const done = (o: SendOutcome, extra: Partial<EmailLog> = {}): SendOutcome => {
        log({ event: "email.send", purpose, provider: transport?.name ?? "none", outcome: o.ok ? "accepted" : o.reason, ms: Date.now() - t0, ...extra });
        return o;
      };
      if (!PURPOSE_POLICY[purpose]?.enabled) return done({ ok: false, reason: "disabled" });
      if (!transport) return done({ ok: false, reason: "unavailable" });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to) || /[\r\n]/.test(message.subject)) return done({ ok: false, reason: "invalid" });

      if (transport.external && deps.limiter) {
        const [m, h] = await Promise.all([
          deps.limiter(`email-send:${transport.name}:minute`, EXTERNAL_CAPS.perMinute, 60),
          deps.limiter(`email-send:${transport.name}:hour`, EXTERNAL_CAPS.perHour, 3600),
        ]);
        const blocked = [m, h].find((r) => !r.allowed);
        if (blocked) return done({ ok: false, reason: "rate_limited", retryAfterSeconds: blocked.retryAfterSeconds });
      }

      let r;
      try { r = await transport.send(message, { operationId: randomUUID(), timeoutMs: SEND_TIMEOUT_MS, from }); }
      catch { return done({ ok: false, reason: "uncertain" }, { code: "transport_threw" }); } // error text may contain the address: dropped
      if (r.status === "accepted") return done({ ok: true, provider: transport.name, providerRef: r.providerRef }, { ref: r.providerRef });
      if (r.status === "uncertain") return done({ ok: false, reason: "uncertain" }, { code: r.code });
      return done({ ok: false, reason: "rejected", retryAfterSeconds: r.retryAfterSeconds }, { code: r.code });
    },
  };
}
