import { describe, expect, it } from "vitest";
import {
  assertDevAuthNotInProduction,
  assertProductionRuntimeConfig,
  entraFullyConfigured,
} from "@/lib/production-guards";

const base = {
  NODE_ENV: "production" as const,
  ADMIN_APP_URL: "https://admin.mawica.com",
  ADMIN_ENTRA_TENANT_ID: "tenant",
  ADMIN_ENTRA_CLIENT_ID: "client",
  ADMIN_ENTRA_CLIENT_SECRET: "secret",
  ADMIN_ENTRA_REDIRECT_URI: "https://admin.mawica.com/api/auth/callback",
  ADMIN_STAFF_ALLOWLIST: "owner@mawica.com:OWNER",
};

describe("production guards", () => {
  it("rejects ADMIN_DEV_AUTH in production", () => {
    expect(() =>
      assertDevAuthNotInProduction({ ...base, ADMIN_DEV_AUTH: "1" }, { isBuildPhase: false }),
    ).toThrow(/ADMIN_DEV_AUTH/);
    expect(() =>
      assertDevAuthNotInProduction({ ...base, ADMIN_DEV_AUTH: "1" }, { isBuildPhase: true }),
    ).not.toThrow();
  });

  it("requires Entra + allowlist + matching redirect at runtime", () => {
    expect(() =>
      assertProductionRuntimeConfig(base, { isBuildPhase: false }),
    ).not.toThrow();

    expect(() =>
      assertProductionRuntimeConfig(
        { ...base, ADMIN_ENTRA_CLIENT_SECRET: undefined },
        { isBuildPhase: false },
      ),
    ).toThrow(/ENTRA|Entra/);

    expect(() =>
      assertProductionRuntimeConfig(
        { ...base, ADMIN_STAFF_ALLOWLIST: "" },
        { isBuildPhase: false },
      ),
    ).toThrow(/ALLOWLIST/);

    expect(() =>
      assertProductionRuntimeConfig(
        {
          ...base,
          ADMIN_ENTRA_REDIRECT_URI: "https://evil.example/api/auth/callback",
        },
        { isBuildPhase: false },
      ),
    ).toThrow(/origin/);

    expect(() =>
      assertProductionRuntimeConfig(
        {
          ...base,
          ADMIN_APP_URL: "http://admin.mawica.com",
        },
        { isBuildPhase: false },
      ),
    ).toThrow(/https/);
  });

  it("skips hard Entra requirements during image build phase", () => {
    expect(() =>
      assertProductionRuntimeConfig(
        {
          NODE_ENV: "production",
          ADMIN_APP_URL: "https://admin.build.invalid",
        },
        { isBuildPhase: true },
      ),
    ).not.toThrow();
  });

  it("detects complete Entra config", () => {
    expect(entraFullyConfigured(base)).toBe(true);
    expect(entraFullyConfigured({ ...base, ADMIN_ENTRA_REDIRECT_URI: undefined })).toBe(false);
  });
});
