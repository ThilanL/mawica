import { createHash, createHmac } from "node:crypto";
import type { OutboundEmail, TransactionalTransport, TransportResult } from "../types";

export const ACS_API_VERSION = "2025-09-01";

/**
 * Azure Communication Services Email over REST (no SDK dependency; request signing per the documented HMAC-SHA256 scheme).
 * NOT yet exercised against the real service: send path, headers and error codes follow Microsoft's REST reference
 * (docs/email.md lists what a real integration test must confirm). `fetchImpl` is injected so tests use mocks only.
 * Error reasons are codes only: provider message bodies can echo recipient addresses and are never kept.
 */
export class AcsEmailTransport implements TransactionalTransport {
  readonly name = "acs" as const;
  readonly external = true;
  constructor(private readonly cfg: { endpoint: string; accessKey: string }, private readonly fetchImpl: typeof fetch = fetch, private readonly now: () => Date = () => new Date()) {}

  /** Exposed for the signing unit test. */
  sign(pathAndQuery: string, body: string) {
    const u = new URL(this.cfg.endpoint);
    const date = this.now().toUTCString(); // RFC 1123, GMT
    const contentHash = createHash("sha256").update(body, "utf8").digest("base64");
    const stringToSign = `POST\n${pathAndQuery}\n${date};${u.host};${contentHash}`;
    const signature = createHmac("sha256", Buffer.from(this.cfg.accessKey, "base64")).update(stringToSign, "utf8").digest("base64");
    return { date, host: u.host, contentHash, authorization: `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}` };
  }

  async send(m: OutboundEmail, ctx: { operationId: string; timeoutMs: number; from: string }): Promise<TransportResult> {
    const pathAndQuery = `/emails:send?api-version=${ACS_API_VERSION}`;
    const body = JSON.stringify({
      senderAddress: ctx.from,
      content: { subject: m.subject, plainText: m.text, ...(m.html ? { html: m.html } : {}) },
      recipients: { to: [{ address: m.to }] },
      userEngagementTrackingDisabled: true,
    });
    const s = this.sign(pathAndQuery, body);
    let res: Response;
    try {
      res = await this.fetchImpl(this.cfg.endpoint + pathAndQuery, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(ctx.timeoutMs),
        headers: { "content-type": "application/json", "x-ms-date": s.date, "x-ms-content-sha256": s.contentHash, authorization: s.authorization, "operation-id": ctx.operationId },
        body,
      });
    } catch (e) {
      // Timeout or connection loss after the request may have been written: the message may or may not have been accepted.
      return { status: "uncertain", code: e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "network" };
    }
    if (res.status === 202) {
      const j = (await res.json().catch(() => null)) as { id?: unknown } | null;
      return { status: "accepted", providerRef: typeof j?.id === "string" ? j.id : ctx.operationId };
    }
    const code = String(res.headers.get("x-ms-error-code") ?? `http_${res.status}`).replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 64) || `http_${res.status}`;
    await res.body?.cancel().catch(() => {});
    if (res.status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      return { status: "rejected", permanent: false, code: "throttled", retryAfterSeconds: Number.isFinite(ra) && ra > 0 ? Math.min(ra, 3600) : 60 };
    }
    if (res.status >= 500 || res.status === 408) return { status: "rejected", permanent: false, code };
    // 3xx (not followed), 400, 401, 403, 404, 409...: our request or credentials are wrong; retrying the same call will not help.
    return { status: "rejected", permanent: true, code };
  }
}
