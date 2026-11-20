// Staging noindex (MAWICA_NOINDEX=1 at build time) versus production (unset): robots.txt, sitemap, response headers and metadata.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { isNoindex } from "@/lib/site";

const headersFor = async (path: string) => {
  const rules = (await nextConfig.headers!()) as { source: string; headers: { key: string; value: string }[] }[];
  const match = (src: string) => src === "/:path*" || (src.startsWith("/ar/") && path.startsWith("/ar/") && path.endsWith(src.split("*")[1] ?? ""));
  return Object.fromEntries(rules.filter((r) => match(r.source)).flatMap((r) => r.headers.map((h) => [h.key, h.value])));
};

afterEach(() => vi.unstubAllEnvs());

describe("production build (MAWICA_NOINDEX unset)", () => {
  it("is indexable: robots allows /, lists the sitemap; no X-Robots-Tag", async () => {
    vi.stubEnv("MAWICA_NOINDEX", "");
    expect(isNoindex()).toBe(false);
    const r = robots();
    expect(r.rules).toEqual([{ userAgent: "*", allow: "/", disallow: ["/c/", "/api/", "/lab/", "/account", "/sign-in"] }]);
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/);
    expect(sitemap().length).toBeGreaterThan(0);
    expect((await headersFor("/"))["X-Robots-Tag"]).toBeUndefined();
  });
});

describe("staging build (MAWICA_NOINDEX=1)", () => {
  it("robots disallows everything and advertises no sitemap; sitemap is empty", () => {
    vi.stubEnv("MAWICA_NOINDEX", "1");
    expect(robots()).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
    expect(sitemap()).toEqual([]);
  });

  it("every response, including card pages, carries X-Robots-Tag noindex; security headers are kept", async () => {
    vi.stubEnv("MAWICA_NOINDEX", "1");
    for (const path of ["/", "/create", "/c/some-card", "/sign-in"]) {
      const h = await headersFor(path);
      expect(h["X-Robots-Tag"]).toBe("noindex, nofollow");
      expect(h["X-Frame-Options"]).toBe("DENY");
      expect(h["Strict-Transport-Security"]).toBe("max-age=86400");
    }
  });

  it("AR models keep their types and caching (delivery unaffected)", async () => {
    vi.stubEnv("MAWICA_NOINDEX", "1");
    expect((await headersFor("/ar/special-gift.usdz"))["Content-Type"]).toBe("model/vnd.usdz+zip");
    expect((await headersFor("/ar/special-gift.glb"))["Content-Type"]).toBe("model/gltf-binary");
  });

  it("only values exactly '1' switch it on", () => {
    for (const v of ["0", "true", "yes", "", " 1"]) expect(isNoindex({ MAWICA_NOINDEX: v })).toBe(false);
    expect(isNoindex({ MAWICA_NOINDEX: "1" })).toBe(true);
  });
});

describe("build wiring", () => {
  it("only the staging workflow passes MAWICA_NOINDEX=1; the Dockerfile defaults to off and scopes it to the build", () => {
    const wf = readFileSync(resolve(__dirname, "../.github/workflows/deploy-staging.yml"), "utf8");
    const docker = readFileSync(resolve(__dirname, "../Dockerfile"), "utf8");
    expect(wf).toContain("--build-arg MAWICA_NOINDEX=1");
    expect(docker).toContain('ARG MAWICA_NOINDEX=""');
    expect(docker).toContain('MAWICA_NOINDEX="$MAWICA_NOINDEX" npm run build');
    expect(docker).not.toMatch(/ENV[^\n]*MAWICA_NOINDEX/);
  });
});
