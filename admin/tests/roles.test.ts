import { describe, expect, it } from "vitest";
import {
  assertPermission,
  hasPermission,
  parseStaffRole,
  permissionsFor,
  resolveSeedRoleFromAllowlist,
  StaffAuthzError,
} from "@/modules/staff/roles";

describe("staff RBAC", () => {
  it("grants owner every permission", () => {
    expect(permissionsFor("OWNER")).toContain("staff:manage");
    expect(hasPermission("OWNER", "cards:remove")).toBe(true);
  });

  it("allows moderator remove but not customer or wallet access", () => {
    expect(hasPermission("MODERATOR", "cards:remove")).toBe(true);
    expect(hasPermission("MODERATOR", "users:read")).toBe(false);
    expect(hasPermission("MODERATOR", "wallet:read")).toBe(false);
    expect(hasPermission("MODERATOR", "wallet:adjust")).toBe(false);
  });

  it("gives support user+wallet read without adjust in P2", () => {
    expect(hasPermission("SUPPORT", "users:read")).toBe(true);
    expect(hasPermission("SUPPORT", "wallet:read")).toBe(true);
    expect(hasPermission("SUPPORT", "wallet:adjust")).toBe(false);
  });

  it("gives OPS ops+wallet read for credit activity metrics", () => {
    expect(hasPermission("OPS", "ops:read")).toBe(true);
    expect(hasPermission("OPS", "wallet:read")).toBe(true);
    expect(hasPermission("OPS", "wallet:adjust")).toBe(false);
    expect(hasPermission("SUPPORT", "ops:read")).toBe(false);
  });

  it("keeps readonly from mutating moderation", () => {
    expect(hasPermission("READONLY", "reports:read")).toBe(true);
    expect(hasPermission("READONLY", "cards:remove")).toBe(false);
    expect(() => assertPermission("READONLY", "cards:remove")).toThrow(StaffAuthzError);
  });

  it("parses roles case-insensitively", () => {
    expect(parseStaffRole("moderator")).toBe("MODERATOR");
    expect(parseStaffRole("nope")).toBeNull();
  });
});

describe("allowlist seeding", () => {
  it("resolves email and oid forms", () => {
    const list = "local-dev-oid:dev.admin@mawica.local:OWNER,finance@mawica.com:FINANCE";
    expect(
      resolveSeedRoleFromAllowlist(list, { entraOid: "local-dev-oid", email: "dev.admin@mawica.local" }),
    ).toBe("OWNER");
    expect(
      resolveSeedRoleFromAllowlist(list, { entraOid: "other", email: "finance@mawica.com" }),
    ).toBe("FINANCE");
    expect(
      resolveSeedRoleFromAllowlist(list, { entraOid: "x", email: "stranger@mawica.com" }),
    ).toBeNull();
  });
});
