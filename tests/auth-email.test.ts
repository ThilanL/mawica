import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { db } from "@/lib/db";

// Drives the real auth route + Better Auth + database (mawica_test). Only the email provider env changes between cases.
const stamp = Date.now();
let n = 0;
const fresh = () => ({ email: `ae${++n}+${stamp}@auth-email.example.test`, ip: `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${n}` });
const post = async (email: string, ip: string) => {
  const { POST } = await import("@/app/api/auth/[...all]/route");
  return POST(new Request("http://localhost:3000/api/auth/email-otp/send-verification-otp", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": ip }, body: JSON.stringify({ email, type: "sign-in" }) }));
};
const stored = (email: string) => db.verification.count({ where: { identifier: `sign-in-otp-${email}` } });

describe("sign-in code email (route -> Better Auth -> email service)", () => {
  beforeEach(async () => { vi.resetModules(); await db.$executeRaw`DELETE FROM "RateLimit" WHERE key LIKE 'email-send:%'`; });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await db.$executeRaw`DELETE FROM "RateLimit" WHERE key LIKE 'email-send:%'`;
    await db.verification.deleteMany({ where: { identifier: { contains: `+${stamp}@auth-email.example.test` } } });
    await db.user.deleteMany({ where: { email: { endsWith: `+${stamp}@auth-email.example.test` } } });
    await db.$disconnect();
  });

  it("dev/test: delivers through the local outbox, code in the body but not the subject", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "ae-")), "o.jsonl");
    vi.stubEnv("MAIL_LOCAL_OUTBOX", file);
    const { email, ip } = fresh();
    const res = await post(email, ip);
    expect(res.status).toBe(200);
    const line = JSON.parse(readFileSync(file, "utf8").trim().split("\n").at(-1)!);
    expect(line.to).toBe(email);
    expect(line.otp).toMatch(/^\d{6}$/);
    expect(line.subject).not.toContain(line.otp);
    expect(await stored(email)).toBe(1);
  });

  it("production without a provider: generic 503, nothing readable written, no stored code, no user", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "ae-")), "o.jsonl");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_LOCAL_OUTBOX", file); // set on purpose: must NOT be honoured without MAWICA_ENV=local
    vi.stubEnv("MAWICA_ENV", undefined);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { email, ip } = fresh();
    const res = await post(email, ip);
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(text).not.toMatch(/outbox|provider|acs|config/i);
    expect(existsSync(file)).toBe(false);
    expect(await stored(email)).toBe(0);
    expect(await db.user.count({ where: { email } })).toBe(0);
    expect(spy.mock.calls.flat().join(" ")).not.toContain(email);
    spy.mockRestore();
  });

  it("kill switch / incomplete ACS config: fails closed with the same generic 503 and makes no network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_PROVIDER", "acs");
    vi.stubEnv("ACS_EMAIL_ENDPOINT", "https://x.australia.communication.azure.com");
    vi.stubEnv("ACS_EMAIL_ACCESS_KEY", Buffer.from("k".repeat(32)).toString("base64"));
    vi.stubEnv("EMAIL_FROM_AUTH", "DoNotReply@mail.example.test");
    vi.stubEnv("MAWICA_DISABLE_EXTERNAL_EMAIL", "1");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { email, ip } = fresh();
    expect((await post(email, ip)).status).toBe(503);
    expect(await stored(email)).toBe(0);
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).includes("azure.com"))).toHaveLength(0);
    spy.mockRestore(); fetchSpy.mockRestore();
  });

  it("provider failure (mocked ACS 500): 503, stored code removed, no user, no address or key in logs", async () => {
    const key = Buffer.from("k".repeat(32)).toString("base64");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_PROVIDER", "acs");
    vi.stubEnv("ACS_EMAIL_ENDPOINT", "https://x.australia.communication.azure.com");
    vi.stubEnv("ACS_EMAIL_ACCESS_KEY", key);
    vi.stubEnv("EMAIL_FROM_AUTH", "DoNotReply@mail.example.test");
    const calls: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((async (u: string | URL | Request) => { calls.push(String(u)); return new Response("{}", { status: 500 }); }) as typeof fetch);
    const out: string[] = [];
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { out.push(a.join(" ")); }));
    const { email, ip } = fresh();
    const res = await post(email, ip);
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(1); // mocked: no real request was made
    expect(await stored(email)).toBe(0);
    expect(await db.user.count({ where: { email } })).toBe(0);
    const logged = out.join("\n");
    expect(logged).toContain('"outcome":"rejected"');
    expect(logged).not.toMatch(new RegExp(`${email.split("@")[0].replace("+", "\\+")}|${key}`));
    spies.forEach((s) => s.mockRestore()); fetchSpy.mockRestore();
  });

  it("mocked ACS 202: success response is identical for any address (no enumeration signal)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_PROVIDER", "acs");
    vi.stubEnv("ACS_EMAIL_ENDPOINT", "https://x.australia.communication.azure.com");
    vi.stubEnv("ACS_EMAIL_ACCESS_KEY", Buffer.from("k".repeat(32)).toString("base64"));
    vi.stubEnv("EMAIL_FROM_AUTH", "DoNotReply@mail.example.test");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((async () => new Response(JSON.stringify({ id: "op", status: "Running" }), { status: 202 })) as typeof fetch);
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const a = fresh(), b = fresh();
    await db.user.create({ data: { email: b.email, name: "x", emailVerified: true } }).catch(() => {});
    const [ra, rb] = [await post(a.email, a.ip), await post(b.email, b.ip)];
    expect([ra.status, rb.status]).toEqual([200, 200]);
    expect(await ra.text()).toBe(await rb.text());
    spy.mockRestore(); fetchSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Phase 2D.2 security review: concurrency, isolation, expiry, provider outcomes. Mocked fetch only, no real network.
describe("auth email security review (mocked ACS)", () => {
  const KEY = Buffer.from("k".repeat(32)).toString("base64");
  const useAcs = () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_PROVIDER", "acs");
    vi.stubEnv("ACS_EMAIL_ENDPOINT", "https://x.australia.communication.azure.com");
    vi.stubEnv("ACS_EMAIL_ACCESS_KEY", KEY);
    vi.stubEnv("EMAIL_FROM_AUTH", "DoNotReply@mail.example.test");
  };
  type Handler = (to: string, code: string | undefined) => Response | Promise<Response> | never;
  const mockProvider = (handler: Handler) => {
    const sent: { to: string; code?: string }[] = [];
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation((async (_u: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const to = body.recipients.to[0].address as string;
      const code = /\b(\d{6})\b/.exec(body.content.plainText)?.[1];
      sent.push({ to, code });
      return handler(to, code);
    }) as typeof fetch);
    return { sent, spy };
  };
  const ok = () => new Response(JSON.stringify({ id: "op-1", status: "Running" }), { status: 202 });
  const verify = async (email: string, otp: string, ip: string) => {
    const { POST } = await import("@/app/api/auth/[...all]/route");
    return POST(new Request("http://localhost:3000/api/auth/sign-in/email-otp", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": ip }, body: JSON.stringify({ email, otp }) }));
  };
  const logs: string[] = [];
  const captureLogs = () => (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.join(" ")); }));
  // the service caps external sends globally (20/min); reset that counter so tests do not trip it
  beforeEach(async () => { vi.resetModules(); logs.length = 0; await db.$executeRaw`DELETE FROM "RateLimit" WHERE key LIKE 'email-send:%'`; });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("two simultaneous requests with different provider outcomes stay isolated: A succeeds and signs in, B gets a generic 503 and nothing is left behind", async () => {
    useAcs(); captureLogs();
    const a = fresh(), b = fresh();
    const { sent } = mockProvider(async (to) => { await new Promise((r) => setTimeout(r, to === b.email ? 5 : 25)); return to === b.email ? new Response("{}", { status: 500 }) : ok(); });
    const [ra, rb] = await Promise.all([post(a.email, a.ip), post(b.email, b.ip)]);
    expect([ra.status, rb.status]).toEqual([200, 503]);
    expect(await ra.text()).toBe('{"success":true}');
    expect(await stored(a.email)).toBe(1); // B's failure did not touch A's valid code
    expect(await stored(b.email)).toBe(0);
    const code = sent.find((s) => s.to === a.email)!.code!;
    expect((await verify(a.email, code, a.ip)).status).toBe(200); // A really can sign in with the code B's failure could not erase
    expect(await db.user.count({ where: { email: b.email } })).toBe(0);
  });

  it("request-scoped failure flag does not leak between concurrent requests (many in parallel, alternating outcomes)", async () => {
    useAcs(); captureLogs();
    const items = Array.from({ length: 12 }, (_, i) => ({ ...fresh(), fail: i % 3 === 0 }));
    mockProvider(async (to) => { await new Promise((r) => setTimeout(r, Math.random() * 20)); return items.find((x) => x.email === to)!.fail ? new Response("{}", { status: 503 }) : ok(); });
    const res = await Promise.all(items.map((x) => post(x.email, x.ip)));
    expect(res.map((r) => r.status)).toEqual(items.map((x) => (x.fail ? 503 : 200)));
    for (const x of items) expect(await stored(x.email)).toBe(x.fail ? 0 : 1);
  });

  it("a failing request only removes its OWN code: a newer valid code for the same address survives", async () => {
    useAcs(); captureLogs();
    const x = fresh();
    mockProvider(async () => {
      // while this request's send is in flight, a concurrent request for the same address stores a newer, valid code
      await db.verification.create({ data: { identifier: `sign-in-otp-${x.email}`, value: "newerhash:0", expiresAt: new Date(Date.now() + 300_000) } });
      return new Response("{}", { status: 500 });
    });
    expect((await post(x.email, x.ip)).status).toBe(503);
    const rows = await db.verification.findMany({ where: { identifier: `sign-in-otp-${x.email}` } });
    expect(rows.map((r) => r.value)).toEqual(["newerhash:0"]);
  });

  it.each([
    ["429 throttled", () => new Response("{}", { status: 429, headers: { "retry-after": "30" } }), "throttled"],
    ["500 error", () => new Response("{}", { status: 500 }), "http_500"],
    ["401 bad credentials", () => new Response("{}", { status: 401 }), "http_401"],
  ])("provider %s: generic 503, own code removed, outcome code logged, nothing sensitive", async (_n, make, code) => {
    useAcs(); captureLogs();
    mockProvider(() => make());
    const x = fresh();
    const res = await post(x.email, x.ip);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toMatch(/azure|acs|429|500|401|throttl/i);
    expect(await stored(x.email)).toBe(0);
    expect(logs.join("\n")).toContain(`"code":"${code}"`);
    expect(logs.join("\n")).not.toContain(x.email.split("@")[0]);
  });

  it("provider timeout: uncertain outcome, generic 503, the code is invalidated so a late mail cannot be used", async () => {
    useAcs(); captureLogs();
    mockProvider(() => { throw Object.assign(new Error("aborted"), { name: "TimeoutError" }); });
    const x = fresh();
    expect((await post(x.email, x.ip)).status).toBe(503);
    expect(await stored(x.email)).toBe(0);
    expect(logs.join("\n")).toContain('"outcome":"uncertain"');
    expect(logs.join("\n")).toContain('"code":"timeout"');
  });

  it("202 means the provider accepted the message, never that it was delivered: success is logged as accepted and no delivery is claimed", async () => {
    useAcs(); captureLogs();
    mockProvider(() => ok());
    const x = fresh();
    expect((await post(x.email, x.ip)).status).toBe(200);
    expect(logs.join("\n")).toContain('"outcome":"accepted"');
    expect(logs.join("\n")).not.toMatch(/deliver(ed|y)/i);
  });

  it("an expired code is rejected and creates no user or session", async () => {
    useAcs(); captureLogs();
    const { sent } = mockProvider(() => ok());
    const x = fresh();
    expect((await post(x.email, x.ip)).status).toBe(200);
    await db.verification.updateMany({ where: { identifier: `sign-in-otp-${x.email}` }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await verify(x.email, sent[0].code!, x.ip);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await db.user.count({ where: { email: x.email } })).toBe(0);
  });

  it("the same response for known and unknown addresses holds for failures too", async () => {
    useAcs(); captureLogs();
    mockProvider(() => new Response("{}", { status: 500 }));
    const known = fresh(), unknown = fresh();
    await db.user.create({ data: { email: known.email, name: "k", emailVerified: true } });
    const [a, b] = [await post(known.email, known.ip), await post(unknown.email, unknown.ip)];
    expect([a.status, b.status]).toEqual([503, 503]);
    expect(await a.text()).toBe(await b.text());
  });

  it("no OTP, address or key ever reaches a log line across a mixed run", async () => {
    useAcs(); captureLogs();
    const { sent } = mockProvider((to) => (to.includes("0") ? new Response("{}", { status: 500 }) : ok()));
    const xs = [fresh(), fresh(), fresh(), fresh()];
    await Promise.all(xs.map((x) => post(x.email, x.ip)));
    const all = logs.join("\n");
    for (const s of sent) { expect(all).not.toContain(s.to); if (s.code) expect(all).not.toContain(s.code); }
    expect(all).not.toContain(KEY);
    expect(all).not.toMatch(/auth-email\.example\.test/);
  });

  it("production without MAWICA_ENV=local never touches the outbox even with every outbox setting present", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "ae-")), "o.jsonl");
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("EMAIL_PROVIDER", "local-outbox"); vi.stubEnv("MAIL_LOCAL_OUTBOX", file); vi.stubEnv("MAWICA_ENV", undefined);
    captureLogs();
    const x = fresh();
    expect((await post(x.email, x.ip)).status).toBe(503);
    expect(existsSync(file)).toBe(false);
  });
});
