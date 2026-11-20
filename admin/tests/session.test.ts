import { describe, expect, it } from "vitest";
import { createStaffSessionToken } from "@/lib/session";
import { jwtVerify } from "jose";

describe("staff session token", () => {
  it("signs a JWT with staff claims", async () => {
    const token = await createStaffSessionToken({
      staffPrincipalId: "11111111-1111-1111-1111-111111111111",
      entraOid: "oid-1",
      email: "owner@mawica.local",
      displayName: "Owner",
      role: "OWNER",
    });
    const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.ADMIN_SESSION_SECRET!), {
      algorithms: ["HS256"],
    });
    expect(payload.email).toBe("owner@mawica.local");
    expect(payload.role).toBe("OWNER");
    expect(payload.staffPrincipalId).toBe("11111111-1111-1111-1111-111111111111");
  });
});
