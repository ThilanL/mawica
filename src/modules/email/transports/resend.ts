import "server-only";
import type { OutboundEmail, TransactionalTransport, TransportResult } from "../types";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Resend over its documented HTTPS API (POST /emails, Bearer API key). No SDK: one request shape, injected `fetch` for tests,
 * same result contract as the ACS adapter. Server-only (the key comes from Key Vault via the container environment).
 *
 * Duplicates: every send carries `Idempotency-Key: <operationId>`, so if a caller ever retries the SAME operation after an
 * ambiguous timeout, Resend returns the original result instead of sending twice. Mawica itself never retries an auth code
 * (an "uncertain" result fails the request; the user asks for a new code, which is a new operation with a new OTP).
 *
 * Errors are reduced to codes: provider messages can echo the recipient address, and the key is never logged or returned.
 */
export class ResendTransport implements TransactionalTransport {
  readonly name = "resend" as const;
  readonly external = true;
  constructor(private readonly cfg: { apiKey: string }, private readonly fetchImpl: typeof fetch = fetch) {}

  async send(m: OutboundEmail, ctx: { operationId: string; timeoutMs: number; from: string }): Promise<TransportResult> {
    const body = JSON.stringify({ from: ctx.from, to: [m.to], subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) });
    let res: Response;
    try {
      res = await this.fetchImpl(RESEND_ENDPOINT, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(ctx.timeoutMs),
        headers: { "content-type": "application/json", authorization: `Bearer ${this.cfg.apiKey}`, "idempotency-key": ctx.operationId, "user-agent": "mawica-email/1" },
        body,
      });
    } catch (e) {
      // The request may have reached Resend before the timeout or connection loss: never report "not sent".
      return { status: "uncertain", code: e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "network" };
    }
    if (res.status === 200 || res.status === 201 || res.status === 202) {
      const j = (await res.json().catch(() => null)) as { id?: unknown } | null;
      return typeof j?.id === "string" && /^[A-Za-z0-9-]{1,100}$/.test(j.id) ? { status: "accepted", providerRef: j.id } : { status: "uncertain", code: "accepted_without_id" };
    }
    // Resend error bodies are {statusCode, name, message}; keep only the machine-readable `name`, sanitized.
    const j = (await res.json().catch(() => null)) as { name?: unknown } | null;
    const code = (typeof j?.name === "string" ? j.name : `http_${res.status}`).replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 64) || `http_${res.status}`;
    if (res.status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      return { status: "rejected", permanent: false, code: "throttled", retryAfterSeconds: Number.isFinite(ra) && ra > 0 ? Math.min(Math.ceil(ra), 3600) : 60 };
    }
    if (res.status === 409) return { status: "uncertain", code }; // idempotency conflict: the original request may still be in flight
    if (res.status >= 500 || res.status === 408) return { status: "rejected", permanent: false, code };
    // 3xx (not followed), 400, 401, 403, 404, 422: our request, sender domain or key is wrong; retrying the same call will not help.
    return { status: "rejected", permanent: true, code };
  }
}
