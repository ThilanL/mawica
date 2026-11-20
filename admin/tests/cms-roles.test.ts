import { describe, expect, it } from "vitest";
import { assertPermission, hasPermission, StaffAuthzError } from "@/modules/staff/roles";

describe("CMS RBAC (P5)", () => {
  it("grants OWNER read, write, and publish", () => {
    expect(hasPermission("OWNER", "cms:read")).toBe(true);
    expect(hasPermission("OWNER", "cms:write")).toBe(true);
    expect(hasPermission("OWNER", "cms:publish")).toBe(true);
  });

  it("allows OPS and READONLY to read but not write or publish", () => {
    for (const role of ["OPS", "READONLY"] as const) {
      expect(hasPermission(role, "cms:read")).toBe(true);
      expect(hasPermission(role, "cms:write")).toBe(false);
      expect(hasPermission(role, "cms:publish")).toBe(false);
      expect(() => assertPermission(role, "cms:publish")).toThrow(StaffAuthzError);
    }
  });

  it("denies MODERATOR, SUPPORT, and FINANCE CMS access in P5", () => {
    for (const role of ["MODERATOR", "SUPPORT", "FINANCE"] as const) {
      expect(hasPermission(role, "cms:read")).toBe(false);
      expect(hasPermission(role, "cms:write")).toBe(false);
      expect(hasPermission(role, "cms:publish")).toBe(false);
    }
  });

  it("keeps cms:publish OWNER-only", () => {
    for (const role of ["MODERATOR", "SUPPORT", "FINANCE", "OPS", "READONLY"] as const) {
      expect(hasPermission(role, "cms:publish")).toBe(false);
    }
  });
});
