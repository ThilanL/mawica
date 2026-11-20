import { describe, expect, it } from "vitest";
import { assertMawicaDatabaseUrl } from "@/lib/db-guard";
import { pickClientIp, UNIDENTIFIED } from "@/modules/security/client-hash";
import { createCardSchema, LIMITS, SLUG_RE } from "@/modules/cards/schema";
import { newSlug } from "@/modules/cards/slug";
import { TEMPLATE_KEYS } from "@/modules/templates/registry";

describe("database isolation guard", () => {
  const url = (host: string, port: string) => `postgresql://u:p@${host}:${port}/db`;
  it("rejects the shared cluster port and the default port", () => {
    expect(() => assertMawicaDatabaseUrl(url("127.0.0.1", "5432"), "development")).toThrow(/5432/);
    expect(() => assertMawicaDatabaseUrl(url("localhost", "5432"), "production")).toThrow();
    expect(() => assertMawicaDatabaseUrl("postgresql://u:p@localhost/db", "development")).toThrow();
  });
  it("accepts the Mawica cluster port", () => {
    expect(() => assertMawicaDatabaseUrl(url("127.0.0.1", "5433"), "development")).not.toThrow();
  });
  it("rejects remote hosts outside production only", () => {
    expect(() => assertMawicaDatabaseUrl(url("db.example.com", "5432"), "development")).toThrow();
    expect(() => assertMawicaDatabaseUrl(url("db.example.com", "5432"), "production")).not.toThrow();
  });
});

describe("trusted proxy client IP", () => {
  it("ignores forwarded headers when no proxy is trusted", () => {
    expect(pickClientIp("1.2.3.4", 0)).toBe(UNIDENTIFIED);
  });
  it("uses the entry appended by our proxy, not client-supplied ones", () => {
    expect(pickClientIp("6.6.6.6, 9.9.9.9", 1)).toBe("9.9.9.9");
    expect(pickClientIp("spoof-a, spoof-b, 9.9.9.9", 1)).toBe("9.9.9.9");
  });
  it("supports two trusted hops (e.g. Front Door + App Service)", () => {
    expect(pickClientIp("6.6.6.6, 9.9.9.9, 10.0.0.1", 2)).toBe("9.9.9.9");
  });
  it("fails closed when the header is missing, short or malformed", () => {
    expect(pickClientIp(null, 1)).toBe(UNIDENTIFIED);
    expect(pickClientIp("9.9.9.9", 2)).toBe(UNIDENTIFIED);
    expect(pickClientIp("<script>", 1)).toBe(UNIDENTIFIED);
  });
  it("strips ports", () => {
    expect(pickClientIp("1.1.1.1, 9.9.9.9:51234", 1)).toBe("9.9.9.9");
    expect(pickClientIp("1.1.1.1, [2001:db8::1]:443", 1)).toBe("2001:db8::1");
  });
});

describe("card input validation", () => {
  const ok = { templateKey: "snow-globe", recipientName: " Ava ", senderName: "Sam", message: "Hi", musicTrackId: "snowlight-on-the-sleigh-path" };
  it("trims, and accepts every registered template", () => {
    for (const templateKey of TEMPLATE_KEYS) {
      const r = createCardSchema.safeParse({ ...ok, templateKey });
      expect(r.success).toBe(true);
    }
    expect(createCardSchema.parse(ok).recipientName).toBe("Ava");
  });
  it("enforces limits", () => {
    expect(createCardSchema.safeParse({ ...ok, recipientName: "a".repeat(LIMITS.name + 1) }).success).toBe(false);
    expect(createCardSchema.safeParse({ ...ok, message: "a".repeat(LIMITS.message + 1) }).success).toBe(false);
    expect(createCardSchema.safeParse({ ...ok, message: "a".repeat(LIMITS.message) }).success).toBe(true);
  });
  it("rejects empty, whitespace-only and unknown templates", () => {
    expect(createCardSchema.safeParse({ ...ok, recipientName: "   " }).success).toBe(false);
    expect(createCardSchema.safeParse({ ...ok, message: "" }).success).toBe(false);
    expect(createCardSchema.safeParse({ ...ok, templateKey: "nope" }).success).toBe(false);
  });
  it("strips control and bidi characters but keeps newlines in messages", () => {
    const r = createCardSchema.parse({ ...ok, recipientName: "A\u0000v‮a", message: "line1\nline2​\u0007" });
    expect(r.recipientName).toBe("Ava");
    expect(r.message).toBe("line1\nline2");
  });
  it("keeps markup as plain text (escaping happens at render)", () => {
    expect(createCardSchema.parse({ ...ok, message: "<b>x</b>" }).message).toBe("<b>x</b>");
  });
});

describe("slugs", () => {
  it("are 12 chars from the safe alphabet and do not collide in 20k samples", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20000; i++) {
      const s = newSlug();
      expect(SLUG_RE.test(s)).toBe(true);
      seen.add(s);
    }
    expect(seen.size).toBe(20000);
  });
  it("SLUG_RE rejects lookalikes and wrong lengths", () => {
    expect(SLUG_RE.test("aaaaaaaaaaa")).toBe(false);
    expect(SLUG_RE.test("aaaaaaaaaaaaa")).toBe(false);
    expect(SLUG_RE.test("aaaaaaaaaaa0")).toBe(false);
    expect(SLUG_RE.test("../../etc/pa")).toBe(false);
  });
});
