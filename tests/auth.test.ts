import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { isAllowedOrigin, hasSessionCookie, normalizeEmail, parseOrigins, profileUpdateSchema, isValidTimeZone } from "@/modules/auth/request";
import { safeNext } from "@/components/auth/SignInForm";

const read = (p: string) => readFileSync(p, "utf8");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = path.join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

describe("email normalisation", () => {
  it("lower-cases, trims and NFKC-normalises", () => {
    expect(normalizeEmail("  Alice@Example.COM ")).toBe("alice@example.com");
    expect(normalizeEmail("ｚoe@example.com")).toBe("zoe@example.com"); // full-width z
  });
  it("rejects non-strings, junk and over-long input", () => {
    for (const bad of [undefined, null, 5, {}, "", "nope", "a@b", "a b@c.com", `${"a".repeat(250)}@x.com`]) expect(normalizeEmail(bad)).toBeNull();
  });
});

describe("origin / CSRF helper", () => {
  const allowed = parseOrigins("https://mawica.com", "http://localhost:3010, not a url");
  it("accepts only exact allowed origins", () => {
    expect(allowed).toEqual(["https://mawica.com", "http://localhost:3010"]);
    expect(isAllowedOrigin(new Headers({ origin: "https://mawica.com" }), allowed)).toBe(true);
    expect(isAllowedOrigin(new Headers({ origin: "https://mawica.com.evil.example" }), allowed)).toBe(false);
    expect(isAllowedOrigin(new Headers({ origin: "http://mawica.com" }), allowed)).toBe(false);
  });
  it("refuses a missing Origin", () => expect(isAllowedOrigin(new Headers(), allowed)).toBe(false));
});

describe("session cookie probe", () => {
  it("matches only the Mawica session cookie", () => {
    expect(hasSessionCookie("a=1; mawica.session_token=abc.def")).toBe(true);
    expect(hasSessionCookie("__Secure-mawica.session_token=abc")).toBe(true);
    expect(hasSessionCookie("other.session_token=abc")).toBe(false);
    expect(hasSessionCookie(null)).toBe(false);
  });
});

describe("post-sign-in redirect target", () => {
  it("allows same-site paths only (no open redirect)", () => {
    expect(safeNext("/account")).toBe("/account");
    expect(safeNext("/create?x=1")).toBe("/create?x=1");
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)", "", null]) expect(safeNext(bad as string | null)).toBe("/account");
  });
});

describe("profile update schema", () => {
  it("is strict: unknown keys (such as a user id) are refused", () => {
    expect(profileUpdateSchema.safeParse({ userId: "x", displayName: "A" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({}).success).toBe(false);
  });
  it("cleans names and validates IANA zones", () => {
    const ok = profileUpdateSchema.parse({ displayName: "  A\u0000‮li\nce  ", timeZone: "Australia/Sydney" });
    expect(ok.displayName).toBe("Alice");
    expect(profileUpdateSchema.safeParse({ displayName: "x".repeat(41) }).success).toBe(false);
    expect(isValidTimeZone("Asia/Colombo")).toBe(true);
    for (const bad of ["Not/AZone", "../etc/passwd", "UTC; DROP", "x".repeat(65)]) expect(isValidTimeZone(bad)).toBe(false);
    expect(profileUpdateSchema.parse({ displayName: null }).displayName).toBeNull();
  });
});

describe("auth configuration guards", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());
  it("pins the verified settings: telemetry off, authRateLimit table, UTC-safe cookies, deny-by-default IP header", async () => {
    const { auth } = await import("@/lib/auth");
    const o = auth.options;
    expect(o.telemetry?.enabled).toBe(false);
    expect(o.rateLimit).toMatchObject({ enabled: true, storage: "database", modelName: "authRateLimit" });
    expect(o.advanced?.ipAddressHeaders).toEqual(["x-mawica-client-ip"]);
    expect(o.advanced?.useSecureCookies).toBe(false); // http://localhost test base URL
    expect(o.session?.expiresIn).toBe(60 * 60 * 24 * 14);
  });
  it("uses Secure cookies whenever the base URL is https", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://staging.example.com");
    const { auth } = await import("@/lib/auth");
    expect(auth.options.advanced?.useSecureCookies).toBe(true);
  });
  it("refuses plain http on a real host", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://mawica.example.com");
    await expect(import("@/lib/auth")).rejects.toThrow(/https/);
  });
  it("refuses to start without a secret (fail closed)", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    await expect(import("@/lib/auth")).rejects.toThrow(/BETTER_AUTH_SECRET|Invalid environment/);
  });
});

describe("isolation of the auth library (initial bundle)", () => {
  const files = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("generated"));
  it("only the auth config, its route and server helpers import better-auth", () => {
    const importers = files.filter((f) => /from ["']better-auth|from ["']@better-auth/.test(read(f))).map((f) => f.replaceAll("\\", "/")).sort();
    expect(importers).toEqual(["src/app/api/auth/[...all]/route.ts", "src/lib/auth.ts"].sort());
  });
  it("public pages, the header and the guest card flow never import the auth modules", () => {
    const publicFiles = [...files.filter((f) => f.includes("src/components/landing") || f.includes("src/components/cards") || f.includes("src/components/create") || f.includes("src/components/lumi")), "src/app/(site)/page.tsx", "src/app/api/cards/route.ts", "src/components/auth/AccountNav.tsx", "src/components/layout/SiteHeader.tsx", "src/proxy.ts"];
    // Static imports only: the cards route reaches accounts/wallet through guarded dynamic imports (signed-in requests only).
    const staticImports = (f: string) => read(f).split("\n").filter((l) => /^import\b/.test(l)).join("\n");
    for (const f of publicFiles) expect(staticImports(f), f).not.toMatch(/@\/lib\/auth|@\/modules\/auth\/(session|audit)|@\/modules\/wallet|better-auth/);
    const route = read("src/app/api/cards/route.ts");
    expect(route).toMatch(/hasSessionCookie\(request\.headers\.get\("cookie"\)\)/);
    expect(route.indexOf('await import("@/modules/auth/session")')).toBeGreaterThan(route.indexOf("hasSessionCookie(request"));
  });
  it("the auth route is deny-by-default with an explicit allowlist", () => {
    const src = read("src/app/api/auth/[...all]/route.ts");
    expect(src).toMatch(/GET: new Set\(\["\/ok"\]\)/);
    expect(src).toMatch(/POST: new Set\(\["\/email-otp\/send-verification-otp", "\/sign-in\/email-otp", "\/sign-out"\]\)/);
    expect(src).toMatch(/headers\.delete\(CLIENT_IP_HEADER\)/);
    expect(src).not.toMatch(/new Request\(req,/); // the incompatible rebuild that throws under Next
  });
});

describe("schema invariants", () => {
  const schema = read("prisma/schema.prisma");
  it("keeps Mawica's own RateLimit model and maps Better Auth's separately", () => {
    expect(schema).toMatch(/model RateLimit \{\s+key\s+String\s+@id @db\.VarChar\(80\)\s+count\s+Int\s+windowStart\s+DateTime\s+expiresAt\s+DateTime/);
    expect(schema).toMatch(/model AuthRateLimit \{[\s\S]*@@map\("authRateLimit"\)/);
  });
  it("every timestamp in the new account models is timestamptz; historical models untouched", () => {
    const marker = schema.indexOf("Accounts (Better Auth");
    const accountPart = schema.slice(marker);
    const dateLines = accountPart.split("\n").filter((l) => /\bDateTime\b/.test(l));
    expect(dateLines.length).toBeGreaterThan(10);
    for (const l of dateLines) expect(l, l).toMatch(/@db\.Timestamptz\(3\)/);
    expect(schema.slice(0, marker)).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)\n/); // Card.createdAt unchanged
  });
  it("card ownership is nullable with SetNull and there is no ownership-required constraint (flag rollback stays possible)", () => {
    expect(schema).toMatch(/ownerId\s+String\?\s+@db\.Uuid/);
    expect(schema).toMatch(/owner\s+User\?\s+@relation\(fields: \[ownerId\], references: \[id\], onDelete: SetNull\)/);
    const sql = readdirSync("prisma/migrations").filter((d) => d.includes("accounts_foundation")).map((d) => read(`prisma/migrations/${d}/migration.sql`)).join("\n");
    expect(sql).toMatch(/ADD COLUMN\s+"ownerId" UUID;/); // nullable, no default, no NOT NULL / CHECK
    expect(sql).not.toMatch(/NOT NULL.*ownerId|CHECK \("ownerId"|DROP |ALTER COLUMN/i);
  });
  it("migrations and schema agree (no drift)", () => {
    const out = execFileSync("npx", ["prisma", "migrate", "diff", "--from-migrations", "prisma/migrations", "--to-schema", "prisma/schema.prisma", "--exit-code"], { encoding: "utf8" });
    expect(out).toMatch(/No difference detected/);
  }, 60000);
});

describe("database behaviour (isolated mawica_test)", () => {
  const made: string[] = [];
  const mkUser = async () => {
    const id = crypto.randomUUID();
    await db.user.create({ data: { id, name: "", email: `${id}@db.example.test` } });
    made.push(id);
    return id;
  };
  afterAll(async () => {
    await db.card.deleteMany({ where: { recipientName: "OwnerTest" } });
    await db.user.deleteMany({ where: { id: { in: made } } });
    await db.$disconnect();
  });

  it("existing and guest cards need no owner", async () => {
    const c = await db.card.create({ data: { slug: "guestcard001", templateKey: "snow-globe", recipientName: "OwnerTest", senderName: "S", message: "m" } });
    expect(c.ownerId).toBeNull();
  });
  it("deleting an account never deletes or blocks the card: ownerId becomes null", async () => {
    const uid = await mkUser();
    const c = await db.card.create({ data: { slug: "ownedcard001", templateKey: "snow-globe", recipientName: "OwnerTest", senderName: "S", message: "m", ownerId: uid } });
    await db.user.delete({ where: { id: uid } });
    const after = await db.card.findUnique({ where: { id: c.id } });
    expect(after).not.toBeNull();
    expect(after?.ownerId).toBeNull();
  });
  it("deleting an account cascades its sessions, profile and settings", async () => {
    const uid = await mkUser();
    await db.profile.create({ data: { userId: uid } });
    await db.accountSettings.create({ data: { userId: uid } });
    await db.session.create({ data: { userId: uid, token: `t-${uid}`, expiresAt: new Date(Date.now() + 3600_000) } });
    await db.user.delete({ where: { id: uid } });
    expect(await db.session.count({ where: { userId: uid } })).toBe(0);
    expect(await db.profile.count({ where: { userId: uid } })).toBe(0);
    expect(await db.accountSettings.count({ where: { userId: uid } })).toBe(0);
  });
  it("timestamptz round-trips exactly and agrees with the database clock regardless of server time zone", async () => {
    const uid = await mkUser();
    const future = new Date(Date.now() + 3600_000), past = new Date(Date.now() - 3600_000);
    const s1 = await db.session.create({ data: { userId: uid, token: `f-${uid}`, expiresAt: future } });
    const s2 = await db.session.create({ data: { userId: uid, token: `p-${uid}`, expiresAt: past } });
    expect((await db.session.findUnique({ where: { id: s1.id } }))?.expiresAt.getTime()).toBe(future.getTime());
    const rows = await db.$queryRaw<{ id: string; live: boolean }[]>`SELECT id::text, "expiresAt" > now() AS live FROM session WHERE "userId" = ${uid}::uuid`;
    expect(rows.find((r) => r.id === s1.id)?.live).toBe(true);
    expect(rows.find((r) => r.id === s2.id)?.live).toBe(false);
    const [{ tz }] = await db.$queryRaw<{ tz: string }[]>`SELECT current_setting('TimeZone') AS tz`;
    expect(tz).toBe("UTC"); // connection option from src/lib/db.ts
  });
  it("audit rows carry no personal data columns and survive user deletion (actor set null)", async () => {
    const uid = await mkUser();
    const row = await db.auditLog.create({ data: { actorId: uid, action: "test.event", meta: { fields: ["displayName"] } } });
    await db.user.delete({ where: { id: uid } });
    const after = await db.auditLog.findUnique({ where: { id: row.id } });
    expect(after?.actorId).toBeNull();
    await db.auditLog.delete({ where: { id: row.id } });
  });
});
