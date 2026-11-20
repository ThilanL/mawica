/**
 * Server-side RBAC for admin.mawica.com.
 * Permissions are checked only on the server — never trust the client.
 */

export const STAFF_ROLES = ["OWNER", "MODERATOR", "SUPPORT", "FINANCE", "OPS", "READONLY"] as const;
export type StaffRoleName = (typeof STAFF_ROLES)[number];

export type StaffPermission =
  | "dashboard:read"
  | "reports:read"
  | "reports:moderate"
  | "cards:remove"
  | "audit:read"
  | "users:read"
  | "wallet:read"
  | "wallet:adjust"
  | "finance:read"
  | "finance:plan"
  | "ops:read"
  | "staff:manage";

const ALL: StaffPermission[] = [
  "dashboard:read",
  "reports:read",
  "reports:moderate",
  "cards:remove",
  "audit:read",
  "users:read",
  "wallet:read",
  "wallet:adjust",
  "finance:read",
  "finance:plan",
  "ops:read",
  "staff:manage",
];

const ROLE_PERMISSIONS: Record<StaffRoleName, readonly StaffPermission[]> = {
  OWNER: ALL,
  MODERATOR: ["dashboard:read", "reports:read", "reports:moderate", "cards:remove", "audit:read"],
  // wallet:adjust reserved for a future phase — P2 is read-only wallet views.
  SUPPORT: ["dashboard:read", "reports:read", "audit:read", "users:read", "wallet:read"],
  // finance:plan = revenue forecasting (P4A); OWNER + FINANCE only — not READONLY.
  FINANCE: ["dashboard:read", "audit:read", "finance:read", "finance:plan", "wallet:read"],
  // wallet:read for credit-activity ops metrics (not revenue / Stripe).
  OPS: ["dashboard:read", "reports:read", "audit:read", "ops:read", "wallet:read"],
  READONLY: ["dashboard:read", "reports:read", "audit:read", "finance:read", "ops:read", "users:read", "wallet:read"],
};

export function permissionsFor(role: StaffRoleName): readonly StaffPermission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: StaffRoleName, permission: StaffPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function assertPermission(role: StaffRoleName, permission: StaffPermission): void {
  if (!hasPermission(role, permission)) {
    throw new StaffAuthzError(`Missing permission: ${permission}`);
  }
}

export class StaffAuthzError extends Error {
  readonly code = "FORBIDDEN";
  constructor(message: string) {
    super(message);
    this.name = "StaffAuthzError";
  }
}

export function parseStaffRole(raw: string): StaffRoleName | null {
  const u = raw.trim().toUpperCase();
  return (STAFF_ROLES as readonly string[]).includes(u) ? (u as StaffRoleName) : null;
}

/** Parse ADMIN_STAFF_ALLOWLIST: `email:ROLE` or `entraOid:email:ROLE`. */
export function resolveSeedRoleFromAllowlist(
  allowlist: string | undefined,
  identity: { entraOid: string; email: string },
): StaffRoleName | null {
  if (!allowlist?.trim()) return null;
  const email = identity.email.trim().toLowerCase();
  for (const part of allowlist.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean)) {
    const bits = part.split(":").map((b) => b.trim());
    if (bits.length === 2) {
      const [who, roleRaw] = bits;
      const role = parseStaffRole(roleRaw);
      if (!role) continue;
      if (who.toLowerCase() === email || who === identity.entraOid) return role;
    }
    if (bits.length === 3) {
      const [oid, who, roleRaw] = bits;
      const role = parseStaffRole(roleRaw);
      if (!role) continue;
      if (oid === identity.entraOid || who.toLowerCase() === email) return role;
    }
  }
  return null;
}
