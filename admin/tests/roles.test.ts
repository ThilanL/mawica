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

  it("allows moderator remove but not wallet adjust", () => {
    expect(hasPermission("MODERATOR", "cards:remove")).toBe(true);
    expect(hasPermission("MODERATOR", "wallet:adjust")).toBe(false);
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
