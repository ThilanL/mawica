import { describe, expect, it } from "vitest";
import { GET as live } from "@/app/api/health/route";
import { GET as ready } from "@/app/api/health/ready/route";

describe("admin health endpoints", () => {
  it("liveness reports process ok without secrets", async () => {
    const res = await live();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ status: "ok", check: "process" });
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/postgres|password|DATABASE|SECRET|allowlist|oid/i);
    expect(res.headers.get("cache-control")).toMatch(/no-store/i);
  });

  it("readiness probes database without leaking connection details", async () => {
    const res = await ready();
    expect([200, 503]).toContain(res.status);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.check).toBe("database");
    expect(body.status === "ok" || body.status === "unavailable").toBe(true);
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/postgresql:\/\/|password|5433|SECRET|RATE_LIMIT/i);
  });
});
