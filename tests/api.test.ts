import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { db } from "@/lib/db";
import { POST as publish } from "@/app/api/cards/route";
import { POST as report } from "@/app/api/cards/[slug]/report/route";
import { GET as qr } from "@/app/(card)/c/[slug]/qr.png/route";
import { createCard, getPublishedCard, removeCard } from "@/modules/cards/service";
import { hit } from "@/modules/security/rate-limit";
import { readFileSync } from "node:fs";

const ORIGIN = "http://localhost:3000";
const body = { templateKey: "snow-globe", recipientName: "Ava", senderName: "Sam", message: "Hello" };
let ipCounter = 0;
const freshIp = () => `203.0.113.${(++ipCounter % 250) + 1}`;
const post = (b: unknown, ip = freshIp(), extra: Record<string, string> = {}) =>
  publish(new Request("http://t/api/cards", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": `1.1.1.1, ${ip}`, ...extra },
    body: typeof b === "string" ? b : JSON.stringify(b),
  }));

beforeEach(async () => { await db.rateLimit.deleteMany(); });
afterAll(async () => { await db.card.deleteMany(); await db.rateLimit.deleteMany(); await db.$disconnect(); });

describe("rate limiter", () => {
  it("is atomic: 40 concurrent hits allow exactly the limit", async () => {
    const res = await Promise.all(Array.from({ length: 40 }, () => hit("t:atomic", 5, 60)));
    expect(res.filter((r) => r.allowed)).toHaveLength(5);
  });
  it("resets after the window expires", async () => {
    await hit("t:reset", 1, 60);
    expect((await hit("t:reset", 1, 60)).allowed).toBe(false);
    await db.rateLimit.update({ where: { key: "t:reset" }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await hit("t:reset", 1, 60)).allowed).toBe(true);
  });
});

describe("POST /api/cards (auth required)", () => {
  it("refuses anonymous publish with 401 and inserts nothing", async () => {
    const before = await db.card.count();
    for (const templateKey of ["snow-globe", "christmas-tree", "warm-wishes"] as const) {
      const res = await post({ ...body, templateKey }, freshIp(), { "idempotency-key": `api-anon-${templateKey}-${crypto.randomUUID().slice(0, 8)}` });
      expect(res.status).toBe(401);
      expect((await res.json()).code).toBe("SIGN_IN_REQUIRED");
    }
    expect(await db.card.count()).toBe(before);
  });
  it("rejects a missing or foreign Origin before anything else", async () => {
    const before = await db.card.count();
    expect((await publish(new Request("http://t/api/cards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }))).status).toBe(403);
    expect((await post(body, freshIp(), { origin: "https://evil.example", "idempotency-key": "api-origin-evil0001" })).status).toBe(403);
    expect(await db.card.count()).toBe(before);
  });
  it("rejects bad content type, bad JSON, oversize and invalid fields", async () => {
    expect((await publish(new Request("http://t/api/cards", { method: "POST", headers: { origin: ORIGIN }, body: "x" }))).status).toBe(415);
    expect((await post("{")).status).toBe(400);
    expect((await post("x".repeat(5000))).status).toBe(413);
    const bad = await post({ ...body, recipientName: "", templateKey: "zzz" });
    expect(bad.status).toBe(400);
    expect(Object.keys((await bad.json()).errors)).toEqual(expect.arrayContaining(["recipientName", "templateKey"]));
  });
  it("honeypot: fake success, nothing stored", async () => {
    const before = await db.card.count();
    const res = await post({ ...body, website: "http://spam" });
    expect(res.status).toBe(201);
    expect(await db.card.count()).toBe(before);
  });
  it("attempt flood still rate-limits before auth", async () => {
    const ip = freshIp();
    const codes: number[] = [];
    for (let i = 0; i < 65; i++) {
      codes.push((await post(body, ip, { "idempotency-key": `api-flood-${String(i).padStart(8, "0")}` })).status);
    }
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
    expect(codes.filter((c) => c === 401).length).toBeGreaterThan(0);
  });
});

describe("create wizard: guest publish requires OTP, draft survives, login does not auto-publish", () => {
  it("keeps the sign-in redirect, draft restore and no auto-publish contract", () => {
    const src = readFileSync("src/components/create/CreateWizard.tsx", "utf8");
    expect(src).toMatch(/function signInToPublish/);
    expect(src).toMatch(/sessionStorage\.setItem\(DRAFT_KEY/);
    expect(src).toMatch(/router\.push\("\/sign-in\?next=\/create"\)/);
    expect(src).toMatch(/sessionStorage\.getItem\(DRAFT_KEY\)/);
    expect(src).toMatch(/setStep\("preview"\)/);
    expect(src).toMatch(/function StandardPublish/);
    expect(src).toMatch(/onClick=\{onSignIn\}/);
    expect(src).not.toMatch(/signInToPublish\(\)[\s\S]{0,80}publish\(/);
    expect(src).toMatch(/Sign in to publish/);
  });
});

describe("slug collisions", () => {
  it("retries on unique violation", async () => {
    const first = await createCard({ ...body, templateKey: "snow-globe", website: "" });
    const slugMod = await import("@/modules/cards/slug");
    const spy = vi.spyOn(slugMod, "newSlug");
    spy.mockReturnValueOnce(first.slug).mockReturnValueOnce(first.slug);
    const second = await createCard({ ...body, templateKey: "snow-globe", website: "" });
    expect(second.slug).not.toBe(first.slug);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(3);
    spy.mockRestore();
  });
});

describe("report, removal and QR", () => {
  const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
  const rep = (slug: string, ip: string, b: unknown) => report(new Request(`http://t/api/cards/${slug}/report`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(b) }), ctx(slug));

  it("reports are validated and rate-limited (10/hour per client)", async () => {
    const { slug } = await createCard({ ...body, templateKey: "snow-globe", website: "" });
    expect((await rep(slug, "198.51.100.1, 198.51.100.2", { reason: "NOPE" })).status).toBe(400);
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await rep(slug, "198.51.100.1, 198.51.100.2", { reason: "SPAM" })).status);
    expect(codes.filter((c) => c === 201)).toHaveLength(9); // the invalid attempt above also counted toward the limit
    expect(codes.at(-1)).toBe(429);
    expect((await rep("bad", "1.1.1.1, 2.2.2.2", { reason: "SPAM" })).status).toBe(404);
  });

  it("QR decodes to the exact public URL, and removal makes card and QR 404", async () => {
    const { slug } = await createCard({ ...body, templateKey: "snow-globe", website: "" });
    const res = await qr(new Request(`http://t/c/${slug}/qr.png?download=1`), ctx(slug));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded?.data).toBe(`http://localhost:3000/c/${slug}`);

    expect(await removeCard(slug, "test")).toBe(true);
    expect(await getPublishedCard(slug)).toBeNull();
    const gone = await qr(new Request(`http://t/c/${slug}/qr.png`), ctx(slug));
    expect(gone.status).toBe(404);
    expect(await removeCard(slug, "again")).toBe(false);
  });
});

describe("proxy debug endpoint", () => {
  it("is invisible unless explicitly enabled and authorised", async () => {
    const { GET } = await import("@/app/api/_proxy-debug/route");
    const res = await GET(new Request("http://t/api/_proxy-debug", { headers: { "x-admin-token": "whatever" } }));
    expect(res.status).toBe(404); // ENABLE_PROXY_DEBUG is not set in tests
  });
});
