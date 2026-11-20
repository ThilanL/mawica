import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { buildAssumptions } from "@/modules/staff/finance/defaults";
import { buildFinanceProjectionCsv } from "@/modules/staff/finance/export";
import { StaffAuthzError } from "@/modules/staff/roles";
import { upsertStaffPrincipal } from "@/modules/staff/principals";

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const canRun = Boolean(url?.includes("5433"));

describe.skipIf(!canRun)("finance CSV export authz + audit", () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url!, options: "-c timezone=UTC" }),
  });
  let financeStaffId = "";
  let readonlyStaffId = "";

  beforeAll(async () => {
    const finance = await upsertStaffPrincipal({
      entraOid: "test-finance-oid-p4a",
      email: "finance.p4a@mawica.local",
      displayName: "Finance P4A",
      seedRole: "FINANCE",
    });
    const readonly = await upsertStaffPrincipal({
      entraOid: "test-readonly-oid-p4a",
      email: "readonly.p4a@mawica.local",
      displayName: "Readonly P4A",
      seedRole: "READONLY",
    });
    if (!finance || !readonly) throw new Error("staff upsert failed");
    financeStaffId = finance.id;
    readonlyStaffId = readonly.id;
  });

  afterAll(async () => {
    await db.auditLog.deleteMany({
      where: { staffPrincipalId: { in: [financeStaffId, readonlyStaffId] } },
    });
    await db.staffPrincipal.deleteMany({ where: { id: { in: [financeStaffId, readonlyStaffId] } } });
    await db.$disconnect();
  });

  it("exports monthly projection CSV for FINANCE and audits", async () => {
    const assumptions = buildAssumptions({ horizonMonths: 12, scenario: "base" });
    const csv = await buildFinanceProjectionCsv(assumptions, {
      role: "FINANCE",
      staffPrincipalId: financeStaffId,
      rateLimitSalt: process.env.RATE_LIMIT_SALT!,
    });
    expect(csv.body).toContain("gross_revenue_aud");
    expect(csv.body).toContain("projection_only_not_actual_revenue");
    expect(csv.body).not.toMatch(/@mawica\.local|password|sk_/i);
    const lines = csv.body.trim().split("\n");
    expect(lines.length).toBe(13); // header + 12 months

    const audits = await db.auditLog.findMany({
      where: { staffPrincipalId: financeStaffId, action: "finance.projection_exported" },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    expect(audits.length).toBe(1);
    expect(JSON.stringify(audits[0].meta)).toContain("base");
  });

  it("rejects READONLY export", async () => {
    const assumptions = buildAssumptions({ horizonMonths: 12, scenario: "base" });
    await expect(
      buildFinanceProjectionCsv(assumptions, {
        role: "READONLY",
        staffPrincipalId: readonlyStaffId,
        rateLimitSalt: process.env.RATE_LIMIT_SALT!,
      }),
    ).rejects.toBeInstanceOf(StaffAuthzError);
  });
});
