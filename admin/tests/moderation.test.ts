import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { softRemoveCard, listReports } from "@/modules/staff/moderation";
import { StaffAuthzError } from "@/modules/staff/roles";
import { upsertStaffPrincipal } from "@/modules/staff/principals";
import { recordStaffAudit } from "@/modules/staff/audit";

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const canRun = Boolean(url?.includes("5433"));

describe.skipIf(!canRun)("moderation workflow", () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url!, options: "-c timezone=UTC" }),
  });
  let staffId = "";
  let slug = "";

  beforeAll(async () => {
    const staff = await upsertStaffPrincipal({
      entraOid: "test-moderator-oid",
      email: "mod.test@mawica.local",
      displayName: "Mod Test",
      seedRole: "MODERATOR",
    });
    if (!staff) throw new Error("staff upsert failed");
    staffId = staff.id;

    slug = `adm${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
    const card = await db.card.create({
      data: {
        slug,
        templateKey: "snow-globe",
        recipientName: "Ava",
        senderName: "Sam",
        message: "Hello from test — should not appear in admin list payloads",
        status: "PUBLISHED",
      },
    });
    await db.report.create({
      data: { cardId: card.id, reason: "SPAM", details: "suspicious link farm", reporterHash: "a".repeat(64) },
    });
  });

  afterAll(async () => {
    await db.report.deleteMany({ where: { card: { slug } } });
    await db.card.deleteMany({ where: { slug } });
    await db.auditLog.deleteMany({ where: { staffPrincipalId: staffId } });
    await db.staffPrincipal.deleteMany({ where: { id: staffId } });
    await db.$disconnect();
  });

  it("lists reports without message bodies", async () => {
    const { rows } = await listReports({ q: slug });
    expect(rows.length).toBeGreaterThan(0);
    const row = rows.find((r) => r.card.slug === slug);
    expect(row).toBeTruthy();
    expect(JSON.stringify(row)).not.toMatch(/Hello from test/);
    expect(row?.card).not.toHaveProperty("message");
    expect(row?.card).not.toHaveProperty("recipientName");
  });

  it("rejects readonly soft-remove", async () => {
    await expect(
      softRemoveCard({
        slug,
        reason: "test",
        role: "READONLY",
        staffPrincipalId: staffId,
        rateLimitSalt: process.env.RATE_LIMIT_SALT!,
      }),
    ).rejects.toBeInstanceOf(StaffAuthzError);
  });

  it("soft-removes and writes staff audit (REMOVED is terminal)", async () => {
    const removed = await softRemoveCard({
      slug,
      reason: "policy",
      role: "MODERATOR",
      staffPrincipalId: staffId,
      rateLimitSalt: process.env.RATE_LIMIT_SALT!,
    });
    expect(removed).toEqual({ ok: true, slug });
    const card = await db.card.findUnique({ where: { slug } });
    expect(card?.status).toBe("REMOVED");
    expect(card?.removedReason).toBe("policy");

    const audits = await db.auditLog.findMany({
      where: { staffPrincipalId: staffId, action: "moderation.card_removed" },
    });
    expect(audits.length).toBeGreaterThan(0);
    expect(JSON.stringify(audits[0].meta)).toContain(slug);
  });

  it("records staff audit events", async () => {
    await recordStaffAudit("staff.sign_in", {
      staffPrincipalId: staffId,
      rateLimitSalt: process.env.RATE_LIMIT_SALT!,
      bestEffort: false,
      meta: { method: "test" },
    });
    const n = await db.auditLog.count({ where: { staffPrincipalId: staffId, action: "staff.sign_in" } });
    expect(n).toBeGreaterThan(0);
  });
});
