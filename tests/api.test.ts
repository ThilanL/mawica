import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { db } from "@/lib/db";
import { POST as publish } from "@/app/api/cards/route";
import { POST as report } from "@/app/api/cards/[slug]/report/route";
import { GET as qr } from "@/app/(card)/c/[slug]/qr.png/route";
import { createCard, getPublishedCard, removeCard } from "@/modules/cards/service";
import { hit } from "@/modules/security/rate-limit";
import { TEMPLATE_KEYS } from "@/modules/templates/registry";

const body = { templateKey: "snow-globe", recipientName: "Ava", senderName: "Sam", message: "Hello" };
let ipCounter = 0;
const freshIp = () => `203.0.113.${(++ipCounter % 250) + 1}`;
const post = (b: unknown, ip = freshIp(), extra: Record<string, string> = {}) =>
  publish(new Request("http://t/api/cards", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `1.1.1.1, ${ip}`, ...extra }, body: typeof b === "string" ? b : JSON.stringify(b) }));

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

describe("POST /api/cards", () => {
  it("publishes a valid card for every template", async () => {
    for (const templateKey of TEMPLATE_KEYS) {
      const res = await post({ ...body, templateKey });
      expect(res.status).toBe(201);
      const j = await res.json();
      expect(j.url).toBe(`http://localhost:3000/c/${j.slug}`);
      expect((await getPublishedCard(j.slug))?.templateKey).toBe(templateKey);
    }
  });
  it("rejects bad content type, bad JSON, oversize and invalid fields", async () => {
    expect((await publish(new Request("http://t/api/cards", { method: "POST", body: "x" }))).status).toBe(415);
    expect((await post("{")).status).toBe(400);
    expect((await post("x".repeat(5000))).status).toBe(413);
    const bad = await post({ ...body, recipientName: "", templateKey: "zzz" });
    expect(bad.status).toBe(400);
    expect(Object.keys((await bad.json()).errors)).toEqual(expect.arrayContaining(["recipientName", "templateKey"]));
  });
  it("honeypot: fake success, nothing stored, no quota spent", async () => {
    const before = await db.card.count();
    const ip = freshIp();
    const res = await post({ ...body, website: "http://spam" }, ip);
    expect(res.status).toBe(201);
    expect(await db.card.count()).toBe(before);
    for (let i = 0; i < 5; i++) expect((await post(body, ip)).status).toBe(201);
  });
  it("limits 5 valid publishes per client; invalid ones do not spend the quota", async () => {
    const ip = freshIp();
    for (let i = 0; i < 3; i++) await post({ ...body, message: "" }, ip);
    for (let i = 0; i < 5; i++) expect((await post(body, ip)).status).toBe(201);
    const blocked = await post(body, ip);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });
  it("concurrent publishes from one client: exactly 5 succeed", async () => {
    const ip = freshIp();
    const codes = (await Promise.all(Array.from({ length: 15 }, () => post(body, ip)))).map((r) => r.status);
    expect(codes.filter((c) => c === 201)).toHaveLength(5);
    expect(codes.filter((c) => c === 429)).toHaveLength(10);
  });
  it("spoofed left-hand X-Forwarded-For values cannot bypass the limit", async () => {
    const ip = freshIp();
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await publish(new Request("http://t/api/cards", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.9.8.${i}, ${ip}` }, body: JSON.stringify(body) }));
      codes.push(r.status);
    }
    expect(codes.filter((c) => c === 201)).toHaveLength(5);
  });
  it("without forwarded headers every client shares the unidentified bucket (fail closed)", async () => {
    const r = await publish(new Request("http://t/api/cards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    expect(r.status).toBe(201);
    const keys = await db.rateLimit.findMany({ select: { key: true } });
    expect(keys.every((k) => !/\d+\.\d+\.\d+\.\d+/.test(k.key))).toBe(true); // no raw IPs stored
  });
  it("stores user text verbatim as data (no markup interpretation)", async () => {
    const j = await (await post({ ...body, message: "<script>alert(1)</script>" })).json();
    expect((await getPublishedCard(j.slug))?.message).toBe("<script>alert(1)</script>");
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
