import "server-only";
import { db } from "@/lib/db";
import { assertPermission, type StaffRoleName } from "./roles";
import { recordStaffAudit } from "./audit";

export type CustomerListFilters = {
  /** Matches email or display name (case-insensitive contains). */
  q?: string;
  planKey?: string;
  verified?: "yes" | "no";
  page?: number;
  pageSize?: number;
};

/** Directory row — email is required for support lookup; never include messages or media. */
export type CustomerListRow = {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  createdAt: string;
  planKey: string | null;
  cardCount: number;
};

export type CustomerDetail = {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  timeZone: string | null;
  cards: {
    published: number;
    scheduled: number;
    removed: number;
    cancelled: number;
    total: number;
  };
  schedules: { active: number; failed: number };
  recipients: number;
  wallet: AdminWalletView | null;
};

export type AdminWalletView = {
  accountId: string;
  planKey: string;
  planName: string;
  planPurchasable: boolean;
  periodAnchor: string;
  balances: {
    totalRemaining: number;
    premiumRemaining: number;
    welcomePremiumRemaining: number;
    periodPremiumRemaining: number;
  };
  entitlements: { key: string; value: number | null; period: string }[];
  grants: {
    id: string;
    unit: string;
    source: string;
    amount: number;
    remaining: number;
    validFrom: string;
    validTo: string | null;
    active: boolean;
  }[];
  ledger: {
    id: string;
    kind: string;
    delta: number;
    reason: string | null;
    createdAt: string;
    grantSource: string;
    grantUnit: string;
  }[];
};

const DEFAULT_PAGE = 20;
const MAX_PAGE = 50;

export async function listCustomers(filters: CustomerListFilters = {}): Promise<{
  rows: CustomerListRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE));
  const q = filters.q?.trim();

  const where = {
    ...(filters.verified === "yes" ? { emailVerified: true } : {}),
    ...(filters.verified === "no" ? { emailVerified: false } : {}),
    ...(filters.planKey
      ? { creditAccount: { planKey: filters.planKey } }
      : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
            { profile: { displayName: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        createdAt: true,
        profile: { select: { displayName: true } },
        creditAccount: { select: { planKey: true } },
        _count: { select: { cards: true } },
      },
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    rows: users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.profile?.displayName ?? (u.name?.trim() || null),
      emailVerified: u.emailVerified,
      createdAt: u.createdAt.toISOString(),
      planKey: u.creditAccount?.planKey ?? null,
      cardCount: u._count.cards,
    })),
  };
}

/** Read-only wallet snapshot — never calls ensureWallet / ensurePeriodGrants / expireGrants. */
export async function readWalletSnapshot(userId: string, now = new Date()): Promise<AdminWalletView | null> {
  const account = await db.creditAccount.findUnique({
    where: { userId },
    include: {
      plan: { include: { entitlements: true } },
      grants: { orderBy: { createdAt: "desc" }, take: 40 },
      ledger: {
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { grant: { select: { source: true, unit: true } } },
      },
    },
  });
  if (!account) return null;

  const active = (g: { validFrom: Date; validTo: Date | null; remaining: number }) =>
    g.remaining > 0 && g.validFrom <= now && (g.validTo === null || g.validTo > now);

  const welcomePremiumRemaining = account.grants
    .filter((g) => g.source === "WELCOME" && g.unit === "PREMIUM" && active(g))
    .reduce((s, g) => s + g.remaining, 0);
  const periodPremiumRemaining = account.grants
    .filter((g) => g.source === "PLAN_PERIOD" && g.unit === "PREMIUM" && active(g))
    .reduce((s, g) => s + g.remaining, 0);
  const totalRemaining = account.grants.filter((g) => g.unit === "TOTAL" && active(g)).reduce((s, g) => s + g.remaining, 0);
  const premiumRemaining = account.grants.filter((g) => g.unit === "PREMIUM" && active(g)).reduce((s, g) => s + g.remaining, 0);

  return {
    accountId: account.id,
    planKey: account.planKey,
    planName: account.plan.name,
    planPurchasable: account.plan.purchasable,
    periodAnchor: account.periodAnchor.toISOString(),
    balances: {
      totalRemaining,
      premiumRemaining,
      welcomePremiumRemaining,
      periodPremiumRemaining,
    },
    entitlements: account.plan.entitlements.map((e) => ({
      key: e.key,
      value: e.value,
      period: e.period,
    })),
    grants: account.grants.map((g) => ({
      id: g.id,
      unit: g.unit,
      source: g.source,
      amount: g.amount,
      remaining: g.remaining,
      validFrom: g.validFrom.toISOString(),
      validTo: g.validTo?.toISOString() ?? null,
      active: active(g),
    })),
    ledger: account.ledger.map((l) => ({
      id: l.id.toString(),
      kind: l.kind,
      delta: l.delta,
      reason: l.reason,
      createdAt: l.createdAt.toISOString(),
      grantSource: l.grant.source,
      grantUnit: l.grant.unit,
    })),
  };
}

export async function getCustomerDetail(
  userId: string,
  opts: {
    role: StaffRoleName;
    staffPrincipalId: string;
    rateLimitSalt: string;
    ip?: string | null;
    includeWallet: boolean;
  },
): Promise<CustomerDetail | null> {
  assertPermission(opts.role, "users:read");

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
      profile: { select: { displayName: true, timeZone: true } },
      _count: { select: { recipients: true } },
    },
  });
  if (!user) return null;

  const [published, scheduled, removed, cancelled, activeSchedules, failedSchedules, wallet] = await Promise.all([
    db.card.count({ where: { ownerId: userId, status: "PUBLISHED" } }),
    db.card.count({ where: { ownerId: userId, status: "SCHEDULED" } }),
    db.card.count({ where: { ownerId: userId, status: "REMOVED" } }),
    db.card.count({ where: { ownerId: userId, status: "CANCELLED" } }),
    db.scheduledDelivery.count({ where: { ownerId: userId, status: { in: ["SCHEDULED", "PROCESSING"] } } }),
    db.scheduledDelivery.count({ where: { ownerId: userId, status: "FAILED" } }),
    opts.includeWallet ? readWalletSnapshot(userId) : Promise.resolve(null),
  ]);

  await recordStaffAudit("support.customer_viewed", {
    staffPrincipalId: opts.staffPrincipalId,
    rateLimitSalt: opts.rateLimitSalt,
    ip: opts.ip,
    bestEffort: true,
    meta: { userId, wallet: opts.includeWallet },
  });

  return {
    id: user.id,
    email: user.email,
    displayName: user.profile?.displayName ?? (user.name?.trim() || null),
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    timeZone: user.profile?.timeZone ?? null,
    cards: {
      published,
      scheduled,
      removed,
      cancelled,
      total: published + scheduled + removed + cancelled,
    },
    schedules: { active: activeSchedules, failed: failedSchedules },
    recipients: user._count.recipients,
    wallet,
  };
}
