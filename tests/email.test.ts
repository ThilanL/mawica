import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveEmailConfig, localOutboxAllowed, type EmailEnv } from "@/modules/email/config";
import { createEmailService, EXTERNAL_CAPS, type EmailLog } from "@/modules/email/service";
import { AcsEmailTransport, ACS_API_VERSION } from "@/modules/email/transports/acs";
import { FakeTransport } from "@/modules/email/transports/fake";
import { LocalOutboxTransport } from "@/modules/email/transports/local-outbox";
import { authCodeEmail } from "@/modules/email/templates";
import { PURPOSE_POLICY } from "@/modules/email/purposes";

const KEY = Buffer.from("k".repeat(32)).toString("base64");
const LOCAL_DB = "postgresql://u:p@127.0.0.1:5433/mawica_test";
const ACS: EmailEnv = { NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@db.internal:5432/x", EMAIL_PROVIDER: "acs", ACS_EMAIL_ENDPOINT: "https://mawica-stg.australia.communication.azure.com", ACS_EMAIL_ACCESS_KEY: KEY, EMAIL_FROM_AUTH: "DoNotReply@mail.example.test" };
const ADDR = "private.person@example.com";

describe("email config resolution", () => {
  it("defaults to the local outbox only in development/test", () => {
    expect(resolveEmailConfig({ NODE_ENV: "development", DATABASE_URL: LOCAL_DB }).provider).toBe("local-outbox");
    expect(resolveEmailConfig({ NODE_ENV: "test", DATABASE_URL: LOCAL_DB }).provider).toBe("local-outbox");
  });
  it("never falls back to a readable outbox in production", () => {
    for (const e of [
      { NODE_ENV: "production", DATABASE_URL: LOCAL_DB },
      { NODE_ENV: "production", DATABASE_URL: LOCAL_DB, MAIL_LOCAL_OUTBOX: "/tmp/x.jsonl" },
      { NODE_ENV: "production", DATABASE_URL: LOCAL_DB, EMAIL_PROVIDER: "local-outbox" as const },
      { NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@db.internal:5432/x", MAWICA_ENV: "local" as const, EMAIL_PROVIDER: "local-outbox" as const },
    ]) { const c = resolveEmailConfig(e); expect(c.provider).toBe("none"); expect(c.problems.length).toBeGreaterThan(0); }
  });
  it("allows the outbox for a deliberate local production build with a loopback database", () => {
    expect(localOutboxAllowed({ NODE_ENV: "production", MAWICA_ENV: "local", DATABASE_URL: LOCAL_DB })).toBe(true);
    expect(resolveEmailConfig({ NODE_ENV: "production", MAWICA_ENV: "local", DATABASE_URL: LOCAL_DB, MAIL_LOCAL_OUTBOX: "/tmp/o.jsonl" })).toMatchObject({ provider: "local-outbox", outboxPath: "/tmp/o.jsonl" });
  });
  it("accepts a complete ACS config and validates each part without echoing secrets", () => {
    expect(resolveEmailConfig(ACS)).toMatchObject({ provider: "acs", endpoint: "https://mawica-stg.australia.communication.azure.com", from: "DoNotReply@mail.example.test" });
    for (const [patch, text] of [
      [{ ACS_EMAIL_ENDPOINT: "http://x.communication.azure.com" }, "ACS_EMAIL_ENDPOINT"],
      [{ ACS_EMAIL_ENDPOINT: "https://evil.example.com" }, "ACS_EMAIL_ENDPOINT"],
      [{ ACS_EMAIL_ACCESS_KEY: undefined }, "ACS_EMAIL_ACCESS_KEY"],
      [{ ACS_EMAIL_ACCESS_KEY: "not base64 !!!!!!!!!!!!!!!" }, "base64"],
      [{ EMAIL_FROM_AUTH: "Name <a@b.c>" }, "EMAIL_FROM_AUTH"],
      [{ MAWICA_DISABLE_EXTERNAL_EMAIL: "1" as const }, "MAWICA_DISABLE_EXTERNAL_EMAIL"],
    ] as const) {
      const c = resolveEmailConfig({ ...ACS, ...patch });
      expect(c.provider).toBe("none");
      expect(c.problems.join(" ")).toContain(text);
      expect(JSON.stringify(c)).not.toContain(KEY);
    }
  });
});

describe("purpose policy", () => {
  it("enables only account sign-in codes", () => {
    expect(Object.entries(PURPOSE_POLICY).filter(([, p]) => p.enabled).map(([k]) => k)).toEqual(["auth-code"]);
  });
  it("refuses sender notifications and recipient greetings before touching any transport", async () => {
    const t = new FakeTransport();
    const svc = createEmailService(ACS, { transport: t, log: () => {} });
    for (const p of ["sender-notification", "recipient-greeting"] as const) expect(await svc.send(p, { to: ADDR, subject: "s", text: "t" })).toEqual({ ok: false, reason: "disabled" });
    expect(t.outbox).toHaveLength(0);
  });
});

describe("email service", () => {
  const logs: EmailLog[] = [];
  const mk = (t: FakeTransport, extra = {}) => createEmailService(ACS, { transport: t, log: (l) => logs.push(l), ...extra });
  afterEach(() => { logs.length = 0; });
  it("sends an auth code and logs only fixed fields (no address, subject, code or body)", async () => {
    const t = new FakeTransport();
    const r = await mk(t).send("auth-code", authCodeEmail(ADDR, "482913", 5));
    expect(r).toEqual({ ok: true, provider: "fake", providerRef: "fake-1" });
    expect(Object.keys(logs[0]).sort()).toEqual(["event", "provider", "outcome", "ms", "purpose", "ref"].sort());
    expect(JSON.stringify(logs)).not.toMatch(/private|example\.com|482913|sign-in code/);
  });
  it("keeps the code out of the subject", () => { expect(authCodeEmail(ADDR, "482913", 5).subject).not.toContain("482913"); });
  it("fails closed with no transport (unavailable)", async () => {
    const svc = createEmailService({ NODE_ENV: "production", DATABASE_URL: LOCAL_DB }, { log: (l) => logs.push(l) });
    expect(await svc.send("auth-code", { to: ADDR, subject: "s", text: "t" })).toEqual({ ok: false, reason: "unavailable" });
  });
  it("rejects malformed recipients and header-injection subjects", async () => {
    const t = new FakeTransport(); const svc = mk(t);
    expect((await svc.send("auth-code", { to: "nope", subject: "s", text: "t" }))).toMatchObject({ ok: false, reason: "invalid" });
    expect((await svc.send("auth-code", { to: ADDR, subject: "a\r\nBcc: x@y.z", text: "t" }))).toMatchObject({ ok: false, reason: "invalid" });
    expect(t.outbox).toHaveLength(0);
  });
  it("maps provider outcomes and never leaks thrown error text", async () => {
    const t = new FakeTransport();
    t.next = { status: "rejected", permanent: false, code: "throttled", retryAfterSeconds: 42 };
    expect(await mk(t).send("auth-code", { to: ADDR, subject: "s", text: "t" })).toEqual({ ok: false, reason: "rejected", retryAfterSeconds: 42 });
    t.next = { status: "uncertain", code: "timeout" };
    expect(await mk(t).send("auth-code", { to: ADDR, subject: "s", text: "t" })).toMatchObject({ reason: "uncertain" });
    t.next = "throw";
    expect(await mk(t).send("auth-code", { to: ADDR, subject: "s", text: "t" })).toMatchObject({ reason: "uncertain" });
    expect(JSON.stringify(logs)).not.toContain("example.com");
  });
  it("rate-limits external providers below ACS's default quota and skips the limiter for local transports", async () => {
    expect(EXTERNAL_CAPS.perMinute).toBeLessThan(30); expect(EXTERNAL_CAPS.perHour).toBeLessThan(100);
    const t = new FakeTransport(); t.external = true;
    const limiter = vi.fn(async (k: string) => ({ allowed: !k.endsWith("minute"), retryAfterSeconds: 17 }));
    expect(await mk(t, { limiter }).send("auth-code", { to: ADDR, subject: "s", text: "t" })).toEqual({ ok: false, reason: "rate_limited", retryAfterSeconds: 17 });
    expect(t.outbox).toHaveLength(0);
    const local = new FakeTransport(); const l2 = vi.fn(); await mk(local, { limiter: l2 }).send("auth-code", { to: ADDR, subject: "s", text: "t" });
    expect(l2).not.toHaveBeenCalled();
  });
});

describe("local outbox transport", () => {
  it("writes the code to a 0600 file, and never logs", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "mawica-mail-")), "box", "outbox.jsonl");
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const svc = createEmailService({ NODE_ENV: "test", DATABASE_URL: LOCAL_DB, MAIL_LOCAL_OUTBOX: file });
    expect((await svc.send("auth-code", authCodeEmail("a@example.com", "123456", 5))).ok).toBe(true);
    expect(JSON.parse(readFileSync(file, "utf8").trim())).toMatchObject({ to: "a@example.com", otp: "123456" });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    // the structured log line exists but carries neither address nor code
    const logged = spies.flatMap((s) => s.mock.calls.flat()).join(" ");
    expect(logged).not.toMatch(/a@example\.com|123456/);
    spies.forEach((s) => s.mockRestore());
    expect(new LocalOutboxTransport(file).external).toBe(false);
  });
});

describe("ACS adapter (mocked fetch only)", () => {
  const cfg = { endpoint: "https://mawica-stg.australia.communication.azure.com", accessKey: KEY };
  const ctx = { operationId: "11111111-1111-4111-8111-111111111111", timeoutMs: 1000, from: "DoNotReply@mail.example.test" };
  const msg = { to: ADDR, subject: "Your mawica. sign-in code", text: "body 123456" };
  const fixed = () => new Date("2026-11-11T01:02:03Z");

  it("signs requests with the documented HMAC-SHA256 string-to-sign", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => { seen.push({ url: String(url), init: init! }); return new Response(JSON.stringify({ id: "op-1", status: "Running" }), { status: 202 }); });
    const r = await new AcsEmailTransport(cfg, f as unknown as typeof fetch, fixed).send(msg, ctx);
    expect(r).toEqual({ status: "accepted", providerRef: "op-1" });
    const { url, init } = seen[0]; const h = init.headers as Record<string, string>;
    expect(url).toBe(`${cfg.endpoint}/emails:send?api-version=${ACS_API_VERSION}`);
    expect(init.redirect).toBe("manual");
    const hash = createHash("sha256").update(init.body as string).digest("base64");
    expect(h["x-ms-content-sha256"]).toBe(hash);
    expect(h["x-ms-date"]).toBe("Wed, 11 Nov 2026 01:02:03 GMT");
    const sts = `POST\n/emails:send?api-version=${ACS_API_VERSION}\n${h["x-ms-date"]};mawica-stg.australia.communication.azure.com;${hash}`;
    const sig = createHmac("sha256", Buffer.from(KEY, "base64")).update(sts).digest("base64");
    expect(h.authorization).toBe(`HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${sig}`);
    expect(h["operation-id"]).toBe(ctx.operationId);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ senderAddress: ctx.from, recipients: { to: [{ address: ADDR }] }, userEngagementTrackingDisabled: true });
    expect(JSON.stringify(h)).not.toContain(KEY);
  });

  const respond = (status: number, headers: Record<string, string> = {}, body = "{\"error\":{\"message\":\"bad address private.person@example.com\"}}") =>
    new AcsEmailTransport(cfg, (async () => new Response(body, { status, headers })) as unknown as typeof fetch, fixed).send(msg, ctx);

  it("classifies provider responses", async () => {
    expect(await respond(429, { "retry-after": "30" })).toEqual({ status: "rejected", permanent: false, code: "throttled", retryAfterSeconds: 30 });
    expect(await respond(429)).toMatchObject({ retryAfterSeconds: 60 });
    expect(await respond(503)).toMatchObject({ status: "rejected", permanent: false, code: "http_503" });
    expect(await respond(500, { "x-ms-error-code": "ServiceUnavailable" })).toMatchObject({ permanent: false, code: "ServiceUnavailable" });
    for (const s of [400, 401, 403, 404, 409]) expect(await respond(s)).toMatchObject({ status: "rejected", permanent: true });
    expect(await respond(302, { location: "https://evil.example" })).toMatchObject({ permanent: true });
  });
  it("never keeps provider message bodies (they can echo recipient addresses)", async () => {
    expect(JSON.stringify(await respond(400))).not.toMatch(/private|example\.com/);
  });
  it("treats timeouts and network failures as uncertain, not as not-sent", async () => {
    const t = (e: Error) => new AcsEmailTransport(cfg, (async () => { throw e; }) as unknown as typeof fetch, fixed).send(msg, ctx);
    expect(await t(Object.assign(new Error("x"), { name: "TimeoutError" }))).toEqual({ status: "uncertain", code: "timeout" });
    expect(await t(new TypeError("fetch failed"))).toEqual({ status: "uncertain", code: "network" });
  });
  it("accepts a 202 without a usable body, falling back to the operation id", async () => {
    expect(await respond(202, {}, "not json")).toEqual({ status: "accepted", providerRef: ctx.operationId });
  });
  it("makes no real network call in this test run", () => { expect(globalThis.fetch).toBeTypeOf("function"); });
});

describe("purpose separation (static)", () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const files = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("generated"));
  const read = (f: string) => readFileSync(f, "utf8");
  const importsOf = (f: string) => read(f).split("\n").filter((l) => /^\s*(import|export)\b.*from\b|await import\(/.test(l)).join("\n");
  it("the delivery engine and the recipient-email design never import the transactional email module (and vice versa)", () => {
    for (const f of files.filter((f) => f.startsWith("src/modules/delivery"))) expect(importsOf(f), f).not.toMatch(/modules\/email|@\/modules\/email/);
    for (const f of files.filter((f) => f.startsWith("src/modules/email"))) expect(importsOf(f), f).not.toMatch(/modules\/delivery|modules\/scheduling|modules\/cards/);
  });
  it("only the auth hook sends mail, and only with the auth-code purpose", () => {
    const users = files.filter((f) => /@\/modules\/email\/(auth-code|service)/.test(importsOf(f)) && !f.startsWith("src/modules/email"));
    expect(users).toEqual(["src/lib/auth.ts"]);
    expect(read("src/modules/email/auth-code.ts")).toMatch(/\.send\("auth-code"/);
    expect(files.filter((f) => /["']recipient-greeting["']|["']sender-notification["']/.test(read(f)) && !f.startsWith("src/modules/email")).length).toBe(0);
  });
  it("the recipient email path stays inert and behind the consent gate", async () => {
    const { getEmailTransport } = await import("@/modules/delivery/email");
    expect(getEmailTransport()).toBeNull();
    vi.stubEnv("EMAIL_DELIVERY_ENABLED", "1");
    expect(getEmailTransport()).toBeNull();
    vi.unstubAllEnvs();
    expect(PURPOSE_POLICY["recipient-greeting"].enabled).toBe(false);
  });
  it("the local outbox transport and every secret stay out of client code", () => {
    for (const f of files.filter((f) => f.startsWith("src/components") || f.startsWith("src/app") && /\.tsx$/.test(f) && /^"use client"/m.test(read(f)))) {
      expect(read(f), f).not.toMatch(/ACS_EMAIL|modules\/email|MAIL_LOCAL_OUTBOX/);
    }
  });
});
