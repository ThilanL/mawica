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
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
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
