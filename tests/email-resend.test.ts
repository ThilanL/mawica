// Resend transport, recipient allowlist and their wiring into the central email service. Mocked fetch only: no network.
import { describe, expect, it, vi } from "vitest";
import { resolveAllowlist, resolveEmailConfig, type EmailEnv } from "@/modules/email/config";
import { createEmailService, type EmailLog } from "@/modules/email/service";
import { ResendTransport, RESEND_ENDPOINT } from "@/modules/email/transports/resend";
import { FakeTransport } from "@/modules/email/transports/fake";
import { authCodeEmail } from "@/modules/email/templates";

const KEY = "re_TESTKEY_abcdefghijklmnopqrstuvwxyz0123";
const FROM = "no-reply@mail.mawica.example";
const OTP = "482915";
const base: EmailEnv = { NODE_ENV: "production", DATABASE_URL: "postgresql://u@db.example:5432/mawica", EMAIL_PROVIDER: "resend", RESEND_API_KEY: KEY, EMAIL_FROM_AUTH: FROM, MAWICA_DISABLE_EXTERNAL_EMAIL: "0" };
const ctx = { operationId: "op-123", timeoutMs: 1000, from: FROM };
const msg = () => authCodeEmail("allowed@example.test", OTP, 5);

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("Resend config", () => {
  it("resolves with a key and a plain sender", () => {
    const c = resolveEmailConfig(base);
    expect(c.provider).toBe("resend");
    expect(c.problems).toEqual([]);
  });

  it("missing or malformed API key fails closed, without echoing the key", () => {
    for (const RESEND_API_KEY of [undefined, "", "sk_live_123", "re_short", "re_has space in it here!!"]) {
      const c = resolveEmailConfig({ ...base, RESEND_API_KEY });
      expect(c.provider).toBe("none");
      expect(c.problems.join(" ")).toMatch(/RESEND_API_KEY/);
      if (RESEND_API_KEY) expect(c.problems.join(" ")).not.toContain(RESEND_API_KEY);
    }
  });

  it("invalid sender configuration fails closed", () => {
    for (const EMAIL_FROM_AUTH of [undefined, "", "Mawica <no-reply@x.com>", "no-reply", "a@b"]) {
      expect(resolveEmailConfig({ ...base, EMAIL_FROM_AUTH }).provider).toBe("none");
    }
  });

  it("MAWICA_DISABLE_EXTERNAL_EMAIL=1 wins over a complete Resend configuration", () => {
    const c = resolveEmailConfig({ ...base, MAWICA_DISABLE_EXTERNAL_EMAIL: "1" });
    expect(c.provider).toBe("none");
    expect(c.problems.join(" ")).toMatch(/disabled/);
  });
});

describe("Resend transport (mocked fetch)", () => {
  it("sends server-side with Bearer key, idempotency key and the auth-code template", async () => {
    const f = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => reply(200, { id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c" }));
    const r = await new ResendTransport({ apiKey: KEY }, f as unknown as typeof fetch).send(msg(), ctx);
    expect(r).toEqual({ status: "accepted", providerRef: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(RESEND_ENDPOINT);
    const h = init!.headers as Record<string, string>;
    expect(h.authorization).toBe(`Bearer ${KEY}`);
    expect(h["idempotency-key"]).toBe("op-123");
    expect(init!.redirect).toBe("manual");
    const body = JSON.parse(String(init!.body));
    expect(body).toMatchObject({ from: FROM, to: ["allowed@example.test"] });
    expect(body.text).toContain(OTP);
  });

  it("provider rejection is permanent for 4xx and keeps only a sanitized error name", async () => {
    const f = async () => reply(422, { statusCode: 422, name: "validation_error", message: "The to field is invalid: allowed@example.test" });
    const r = await new ResendTransport({ apiKey: KEY }, f as unknown as typeof fetch).send(msg(), ctx);
    expect(r).toEqual({ status: "rejected", permanent: true, code: "validation_error" });
    expect(JSON.stringify(r)).not.toContain("allowed@example.test");
    const auth = await new ResendTransport({ apiKey: KEY }, (async () => reply(401, { name: "missing_api_key" })) as unknown as typeof fetch).send(msg(), ctx);
    expect(auth).toMatchObject({ status: "rejected", permanent: true });
  });

  it("rate limiting maps to a temporary rejection with Retry-After", async () => {
    const r = await new ResendTransport({ apiKey: KEY }, (async () => reply(429, { name: "rate_limit_exceeded" }, { "retry-after": "2" })) as unknown as typeof fetch).send(msg(), ctx);
    expect(r).toEqual({ status: "rejected", permanent: false, code: "throttled", retryAfterSeconds: 2 });
  });

  it("server errors are temporary; idempotency conflicts are uncertain", async () => {
    expect(await new ResendTransport({ apiKey: KEY }, (async () => reply(503, { name: "internal_server_error" })) as unknown as typeof fetch).send(msg(), ctx)).toMatchObject({ status: "rejected", permanent: false });
    expect(await new ResendTransport({ apiKey: KEY }, (async () => reply(409, { name: "concurrent_idempotent_requests" })) as unknown as typeof fetch).send(msg(), ctx)).toMatchObject({ status: "uncertain" });
  });

  it("network timeout is uncertain (never 'not sent')", async () => {
    const timeout = async () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; };
    expect(await new ResendTransport({ apiKey: KEY }, timeout as unknown as typeof fetch).send(msg(), ctx)).toEqual({ status: "uncertain", code: "timeout" });
    const reset = async () => { throw new TypeError("fetch failed"); };
    expect(await new ResendTransport({ apiKey: KEY }, reset as unknown as typeof fetch).send(msg(), ctx)).toEqual({ status: "uncertain", code: "network" });
  });

  it("a 200 without a usable id is uncertain, not accepted", async () => {
    expect(await new ResendTransport({ apiKey: KEY }, (async () => reply(200, {})) as unknown as typeof fetch).send(msg(), ctx)).toEqual({ status: "uncertain", code: "accepted_without_id" });
  });
});

describe("recipient allowlist", () => {
  it("parses exact, normalized addresses (comma or newline separated)", () => {
    const a = resolveAllowlist({ EMAIL_RECIPIENT_ALLOWLIST: " Allowed@Example.TEST ,\nsecond+tag@example.test\n", MAWICA_EMAIL_ALLOWLIST_REQUIRED: "1" });
    expect(a.problems).toEqual([]);
    expect([...a.recipients!]).toEqual(["allowed@example.test", "second+tag@example.test"]);
  });

  it("required + missing or empty fails closed (empty set = nobody)", () => {
    for (const EMAIL_RECIPIENT_ALLOWLIST of [undefined, "", "  ", "\n,\n"]) {
      const a = resolveAllowlist({ EMAIL_RECIPIENT_ALLOWLIST, MAWICA_EMAIL_ALLOWLIST_REQUIRED: "1" });
      expect(a.recipients?.size).toBe(0);
      expect(a.problems.length).toBe(1);
    }
  });

  it("malformed entries fail closed for everyone and are never echoed", () => {
    const a = resolveAllowlist({ EMAIL_RECIPIENT_ALLOWLIST: "allowed@example.test, not-an-address, x@y", MAWICA_EMAIL_ALLOWLIST_REQUIRED: "1" });
    expect(a.recipients?.size).toBe(0);
    expect(a.problems[0]).toMatch(/2 invalid entries/);
    expect(a.problems[0]).not.toContain("allowed@example.test");
  });

  it("not required and unset = no allowlist (production behaviour unchanged)", () => {
    expect(resolveAllowlist({}).recipients).toBeNull();
    expect(resolveAllowlist({ MAWICA_EMAIL_ALLOWLIST_REQUIRED: "0" }).recipients).toBeNull();
  });
});

describe("central email service with allowlist + Resend", () => {
  const env = { ...base, EMAIL_RECIPIENT_ALLOWLIST: "allowed@example.test", MAWICA_EMAIL_ALLOWLIST_REQUIRED: "1" };
  const make = (over: Partial<EmailEnv> = {}) => {
    const logs: EmailLog[] = [];
    const transport = new FakeTransport();
    const svc = createEmailService({ ...env, ...over }, { transport, log: (l) => logs.push(l) });
    return { svc, transport, logs };
  };

  it("allowed recipient is sent (match is case-insensitive)", async () => {
    const { svc, transport } = make();
    expect((await svc.send("auth-code", authCodeEmail("ALLOWED@example.test", OTP, 5))).ok).toBe(true);
    expect(transport.outbox.length).toBe(1);
  });

  it("blocked recipient never reaches the transport", async () => {
    const { svc, transport, logs } = make();
    expect(await svc.send("auth-code", authCodeEmail("someone@example.test", OTP, 5))).toEqual({ ok: false, reason: "blocked" });
    expect(transport.outbox.length).toBe(0);
    expect(logs[0]).toMatchObject({ outcome: "blocked" });
  });

  it("empty or malformed allowlist blocks everyone, including previously allowed addresses", async () => {
    for (const EMAIL_RECIPIENT_ALLOWLIST of ["", "allowed@example.test,bogus"]) {
      const { svc, transport } = make({ EMAIL_RECIPIENT_ALLOWLIST });
      expect((await svc.send("auth-code", authCodeEmail("allowed@example.test", OTP, 5))).ok).toBe(false);
      expect(transport.outbox.length).toBe(0);
      expect(svc.config.problems.join(" ")).toMatch(/EMAIL_RECIPIENT_ALLOWLIST/);
    }
  });

  it("rate limits stay active on top of the allowlist", async () => {
    const limiter = vi.fn(async () => ({ allowed: false, retryAfterSeconds: 30 }));
    const transport = new FakeTransport();
    transport.external = true;
    const svc = createEmailService(env, { transport, limiter, log: () => {} });
    expect(await svc.send("auth-code", authCodeEmail("allowed@example.test", OTP, 5))).toEqual({ ok: false, reason: "rate_limited", retryAfterSeconds: 30 });
    expect(transport.outbox.length).toBe(0);
  });

  it("disabled purposes stay disabled even for allowlisted recipients", async () => {
    const { svc } = make();
    expect(await svc.send("recipient-greeting", authCodeEmail("allowed@example.test", OTP, 5))).toEqual({ ok: false, reason: "disabled" });
  });

  it("no OTP, API key or recipient address in any log line", async () => {
    const { svc, logs } = make();
    await svc.send("auth-code", authCodeEmail("allowed@example.test", OTP, 5));
    await svc.send("auth-code", authCodeEmail("someone@example.test", OTP, 5));
    const all = JSON.stringify(logs) + JSON.stringify(svc.config);
    for (const s of [OTP, "allowed@example.test", "someone@example.test"]) expect(JSON.stringify(logs)).not.toContain(s);
    expect(JSON.stringify(svc.config.problems)).not.toContain(KEY);
    expect(all.length).toBeGreaterThan(0);
  });

  it("the real Resend transport is selected only with a complete config", () => {
    expect(createEmailService(env, { log: () => {} }).config.provider).toBe("resend");
    expect(createEmailService({ ...env, MAWICA_DISABLE_EXTERNAL_EMAIL: "1" }, { log: () => {} }).config.provider).toBe("none");
  });
});
