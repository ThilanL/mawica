import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { getCustomerDetail, listCustomers, readWalletSnapshot } from "@/modules/staff/customers";
import { hasPermission, StaffAuthzError } from "@/modules/staff/roles";
import { upsertStaffPrincipal } from "@/modules/staff/principals";

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const canRun = Boolean(url?.includes("5433"));

describe("customer RBAC matrix", () => {
  it("allows OWNER, SUPPORT, READONLY to read users; not MODERATOR", () => {
    expect(hasPermission("OWNER", "users:read")).toBe(true);
    expect(hasPermission("SUPPORT", "users:read")).toBe(true);
    expect(hasPermission("READONLY", "users:read")).toBe(true);
    expect(hasPermission("MODERATOR", "users:read")).toBe(false);
  });

  it("allows wallet:read without granting wallet:adjust to SUPPORT in P2", () => {
    expect(hasPermission("SUPPORT", "wallet:read")).toBe(true);
    expect(hasPermission("SUPPORT", "wallet:adjust")).toBe(false);
    expect(hasPermission("READONLY", "wallet:read")).toBe(true);
  });
});

describe.skipIf(!canRun)("customer directory & wallet read-only", () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url!, options: "-c timezone=UTC" }),
  });

  let staffId = "";
  let userId = "";
  const email = `p2.customer.${Math.random().toString(36).slice(2, 8)}@example.test`;

  beforeAll(async () => {
    const staff = await upsertStaffPrincipal({
      entraOid: "test-support-oid-p2",
      email: "support.p2@mawica.local",
      displayName: "Support P2",
      seedRole: "SUPPORT",
    });
    if (!staff) throw new Error("staff upsert failed");
    staffId = staff.id;

    const user = await db.user.create({
      data: {
        name: "P2 Test User",
        email,
        emailVerified: true,
        profile: { create: { displayName: "P2 Display", timeZone: "Australia/Sydney" } },
        creditAccount: {
          create: {
            planKey: "free",
            grants: {
              create: [
                {
                  unit: "TOTAL",
                  source: "PLAN_PERIOD",
                  grantKey: `period:free:p2-test:TOTAL`,
                  amount: 10,
                  remaining: 7,
                  validFrom: new Date(Date.now() - 86_400_000),
                  validTo: new Date(Date.now() + 30 * 86_400_000),
                },
                {
                  unit: "PREMIUM",
                  source: "WELCOME",
                  grantKey: "welcome",
                  amount: 1,
                  remaining: 1,
                  validFrom: new Date(Date.now() - 86_400_000),
                  validTo: null,
                },
              ],
            },
          },
        },
      },
      include: { creditAccount: true },
    });
    userId = user.id;

    const accountId = user.creditAccount!.id;
    const grant = await db.creditGrant.findFirst({ where: { accountId, grantKey: "welcome" } });
    await db.ledgerEntry.create({
      data: {
        accountId,
        grantId: grant!.id,
        kind: "GRANT",
        delta: 1,
        reason: "welcome gift",
      },
    });

    await db.card.create({
      data: {
        slug: `p2${Math.random().toString(36).slice(2, 10)}`.slice(0, 12),
        templateKey: "snow-globe",
        recipientName: "Secret Recipient",
        senderName: "Secret Sender",
        message: "PRIVATE MESSAGE MUST NOT APPEAR IN ADMIN PAYLOADS",
        status: "PUBLISHED",
        ownerId: userId,
      },
    });
  });

  afterAll(async () => {
    // LedgerEntry is append-only (DB trigger) — leave grants/ledger; user delete nulls CreditAccount.userId.
    await db.card.deleteMany({ where: { ownerId: userId } });
    await db.profile.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.auditLog.deleteMany({ where: { staffPrincipalId: staffId } });
    await db.staffPrincipal.deleteMany({ where: { id: staffId } });
    await db.$disconnect();
  });

  it("lists customers by email search without card message fields", async () => {
    const { rows } = await listCustomers({ q: email });
    expect(rows.some((r) => r.id === userId)).toBe(true);
    const row = rows.find((r) => r.id === userId)!;
    expect(row.planKey).toBe("free");
    expect(row.cardCount).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(row)).not.toMatch(/PRIVATE MESSAGE/);
    expect(row).not.toHaveProperty("message");
  });

  it("reads wallet without mutating grants", async () => {
    const before = await db.creditGrant.findMany({ where: { account: { userId } }, orderBy: { grantKey: "asc" } });
    const snap = await readWalletSnapshot(userId);
    expect(snap).not.toBeNull();
    expect(snap!.balances.welcomePremiumRemaining).toBe(1);
    expect(snap!.balances.totalRemaining).toBe(7);
    expect(snap!.ledger.length).toBeGreaterThan(0);
    const after = await db.creditGrant.findMany({ where: { account: { userId } }, orderBy: { grantKey: "asc" } });
    expect(after.map((g) => ({ id: g.id, remaining: g.remaining }))).toEqual(
      before.map((g) => ({ id: g.id, remaining: g.remaining })),
    );
  });

  it("loads detail, audits view, and omits private card copy", async () => {
    const detail = await getCustomerDetail(userId, {
      role: "SUPPORT",
      staffPrincipalId: staffId,
      rateLimitSalt: process.env.RATE_LIMIT_SALT!,
      includeWallet: true,
    });
    expect(detail?.email).toBe(email);
    expect(detail?.cards.published).toBeGreaterThanOrEqual(1);
    expect(detail?.wallet?.balances.welcomePremiumRemaining).toBe(1);
    expect(JSON.stringify(detail)).not.toMatch(/PRIVATE MESSAGE|Secret Recipient|Secret Sender/);

    const audits = await db.auditLog.findMany({
      where: { staffPrincipalId: staffId, action: "support.customer_viewed" },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    const match = audits.find((a) => JSON.stringify(a.meta).includes(userId));
    expect(match).toBeTruthy();
    expect(JSON.stringify(match!.meta)).not.toContain(email);
  });

  it("rejects moderator customer detail", async () => {
    await expect(
      getCustomerDetail(userId, {
        role: "MODERATOR",
        staffPrincipalId: staffId,
        rateLimitSalt: process.env.RATE_LIMIT_SALT!,
        includeWallet: false,
      }),
    ).rejects.toBeInstanceOf(StaffAuthzError);
  });
});
