import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { buildOpsCsv, csvCell, loadOpsDashboard, rollupOccasions } from "@/modules/staff/ops/analytics";
import { resolveOpsDateRange } from "@/modules/staff/ops/dates";
import { hasPermission, StaffAuthzError } from "@/modules/staff/roles";
import { upsertStaffPrincipal } from "@/modules/staff/principals";

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const canRun = Boolean(url?.includes("5433"));

describe("ops RBAC + occasion rollup", () => {
  it("allows OWNER/OPS/READONLY ops:read; not SUPPORT/MODERATOR", () => {
    expect(hasPermission("OWNER", "ops:read")).toBe(true);
    expect(hasPermission("OPS", "ops:read")).toBe(true);
    expect(hasPermission("READONLY", "ops:read")).toBe(true);
    expect(hasPermission("SUPPORT", "ops:read")).toBe(false);
    expect(hasPermission("MODERATOR", "ops:read")).toBe(false);
    expect(hasPermission("OPS", "wallet:read")).toBe(true);
  });

  it("rolls template keys into occasions without inventing revenue", () => {
    expect(
      rollupOccasions([
        { key: "snow-globe", count: 2 },
        { key: "new-year-2027", count: 1 },
        { key: "lumis-wish", count: 3 },
        { key: "unknown-legacy", count: 1 },
      ]),
    ).toEqual([
      { key: "Any occasion", count: 3 },
      { key: "Christmas", count: 2 },
      { key: "New Year", count: 1 },
      { key: "Unknown / legacy", count: 1 },
    ]);
  });

  it("neutralises CSV formula injection prefixes", () => {
    expect(csvCell("=CMD()")).toBe("'=CMD()");
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("normal")).toBe("normal");
    expect(csvCell('say "hi", please')).toBe('"say ""hi"", please"');
  });
});

describe.skipIf(!canRun)("ops aggregations + CSV", () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url!, options: "-c timezone=UTC" }),
  });

  let staffId = "";
  let userId = "";
  const stamp = Date.now();
  const email = `p3.ops.${stamp}@example.test`;

  beforeAll(async () => {
    const staff = await upsertStaffPrincipal({
      entraOid: "test-ops-oid-p3",
      email: "ops.p3@mawica.local",
      displayName: "Ops P3",
      seedRole: "OPS",
    });
    if (!staff) throw new Error("staff upsert failed");
    staffId = staff.id;

    const user = await db.user.create({
      data: {
        name: "P3 Ops User",
        email,
        emailVerified: true,
        createdAt: new Date("2026-11-20T12:00:00.000Z"),
        profile: { create: { displayName: "P3 Ops", timeZone: "UTC" } },
      },
    });
    userId = user.id;

    await db.card.create({
      data: {
        slug: `p3${Math.random().toString(36).slice(2, 10)}`.slice(0, 12),
        templateKey: "snow-globe",
        recipientName: "Hidden",
        senderName: "Hidden",
        message: "PRIVATE — must not appear in ops payloads",
        status: "PUBLISHED",
        tier: "STANDARD",
        ownerId: userId,
        createdAt: new Date("2026-11-20T13:00:00.000Z"),
      },
    });

    await db.card.create({
      data: {
        slug: `p3${Math.random().toString(36).slice(2, 10)}`.slice(0, 12),
        templateKey: "lumis-wish",
        recipientName: "Hidden",
        senderName: "Hidden",
        message: "PRIVATE PREMIUM",
        status: "PUBLISHED",
        tier: "PREMIUM",
        ownerId: userId,
        createdAt: new Date("2026-11-20T14:00:00.000Z"),
      },
    });

    await db.report.create({
      data: {
        cardId: (await db.card.findFirst({ where: { ownerId: userId } }))!.id,
        reason: "SPAM",
        details: "should never export",
        reporterHash: "b".repeat(64),
        createdAt: new Date("2026-11-20T15:00:00.000Z"),
      },
    });
  });

  afterAll(async () => {
    await db.report.deleteMany({ where: { card: { ownerId: userId } } });
    await db.card.deleteMany({ where: { ownerId: userId } });
    await db.profile.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.auditLog.deleteMany({ where: { staffPrincipalId: staffId } });
    await db.staffPrincipal.deleteMany({ where: { id: staffId } });
    await db.$disconnect();
  });

  it("aggregates customers/cards in custom range without private copy", async () => {
    const range = resolveOpsDateRange({
      preset: "custom",
      from: "2026-11-19",
      to: "2026-11-21",
    });
    const dash = await loadOpsDashboard(range, {
      role: "OPS",
      staffPrincipalId: staffId,
      rateLimitSalt: process.env.RATE_LIMIT_SALT!,
    });

    expect(dash.customers.registrations).toBeGreaterThanOrEqual(1);
    expect(dash.cards.created).toBeGreaterThanOrEqual(2);
    expect(dash.cards.byTier.some((t) => t.key === "PREMIUM" && t.count >= 1)).toBe(true);
    expect(dash.cards.byOccasion.some((o) => o.key === "Christmas")).toBe(true);
    expect(JSON.stringify(dash)).not.toMatch(/PRIVATE|Hidden|should never export/);
    expect(dash.health.appHttpHealth.measured).toBe(false);
    expect(dash.health.workerHeartbeat.measured).toBe(false);
  });

  it("rejects moderator dashboard load", async () => {
    const range = resolveOpsDateRange({ preset: "7d" });
    await expect(
      loadOpsDashboard(range, {
        role: "MODERATOR",
        staffPrincipalId: staffId,
        rateLimitSalt: process.env.RATE_LIMIT_SALT!,
      }),
    ).rejects.toBeInstanceOf(StaffAuthzError);
  });

  it("exports aggregate CSVs without PII and enforces per-dataset authz", async () => {
    const range = resolveOpsDateRange({
      preset: "custom",
      from: "2026-11-19",
      to: "2026-11-21",
    });
    for (const dataset of ["customers", "cards", "deliveries", "moderation", "wallet", "media"] as const) {
      const csv = await buildOpsCsv(dataset, range, "OPS");
      expect(csv.body).not.toMatch(/PRIVATE|Hidden|@example\.test|should never export/);
      expect(csv.body.split("\n")[0]).toMatch(/^[a-z_,]+$/);
    }

    await expect(buildOpsCsv("customers", range, "MODERATOR")).rejects.toBeInstanceOf(StaffAuthzError);
    await expect(buildOpsCsv("moderation", range, "FINANCE")).rejects.toBeInstanceOf(StaffAuthzError);
    // FINANCE lacks ops:read entirely; SUPPORT has neither ops nor moderation export path
    await expect(buildOpsCsv("wallet", range, "SUPPORT")).rejects.toBeInstanceOf(StaffAuthzError);
  });
});
