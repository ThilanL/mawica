import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CELEBRATION_SECONDS, celebrationPose, clamp, pointerOffset, seeded } from "@/components/lab/lumiMath";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("Lumi celebration timeline", () => {
  it("is idle before and after the celebration", () => {
    for (const t of [-1, CELEBRATION_SECONDS, CELEBRATION_SECONDS + 5]) {
      expect(celebrationPose(t)).toEqual({ spin: 0, hop: 0, squash: 1, joy: 0, glow: 0 });
    }
  });
  it("spins twice, hops, and stays within sane bounds", () => {
    const end = celebrationPose(1.2);
    expect(end.spin).toBeCloseTo(Math.PI * 4, 5);
    let maxHop = 0;
    for (let t = 0; t < CELEBRATION_SECONDS; t += 0.02) {
      const p = celebrationPose(t);
      maxHop = Math.max(maxHop, p.hop);
      expect(p.joy).toBeGreaterThanOrEqual(0);
      expect(p.joy).toBeLessThanOrEqual(1);
      expect(p.squash).toBeGreaterThan(0.8);
      expect(p.squash).toBeLessThanOrEqual(1);
    }
    expect(maxHop).toBeGreaterThan(0.3);
    expect(celebrationPose(CELEBRATION_SECONDS - 0.01).joy).toBeLessThan(0.05);
  });
  it("is deterministic (render-pure particle seeds)", () => {
    const a = seeded(7), b = seeded(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("maps pointers relative to an element and clamps", () => {
    const rect = { left: 100, top: 100, width: 200, height: 200 };
    expect(pointerOffset(200, 200, rect)).toEqual({ x: 0, y: -0 });
    expect(pointerOffset(100, 100, rect)).toEqual({ x: -1, y: 1 });
    expect(pointerOffset(5000, 5000, rect).x).toBe(1.4);
    expect(clamp(5, 0, 1)).toBe(1);
  });
});

describe("Lumi isolation (experimental code stays off the public site)", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const files = walk(join(process.cwd(), "src")).filter((f) => /\.(tsx?|css)$/.test(f));
  it("only the lab imports three or react-three-fiber", () => {
    const offenders = files.filter((f) => /from "(three|@react-three\/[a-z-]+)"/.test(readFileSync(f, "utf8")) && !f.includes("/components/lab/"));
    expect(offenders).toEqual([]);
  });
  it("nothing outside the lab imports the lab components", () => {
    const offenders = files.filter((f) => /components\/lab\//.test(readFileSync(f, "utf8")) && !f.includes("/components/lab/") && !f.includes("/(lab)/"));
    expect(offenders).toEqual([]);
  });
  it("the lab route 404s in production and is noindex", () => {
    expect(read("src/app/(lab)/lab/lumi/page.tsx")).toContain("notFound()");
    expect(read("src/app/(lab)/lab/lumi/page.tsx")).toContain('NODE_ENV === "production"');
    expect(read("src/app/(lab)/layout.tsx")).toContain("index: false");
  });
  it("the lab chunk is lazy-loaded, pauses when hidden and honours reduced motion", () => {
    const lab = read("src/components/lab/LumiLab.tsx");
    expect(lab).toContain("dynamic(() => import(\"./LumiCanvas\")");
    expect(lab).toContain("IntersectionObserver");
    expect(lab).toContain("visibilitychange");
    expect(lab).toContain("usePrefersReducedMotion");
    const canvas = read("src/components/lab/LumiCanvas.tsx");
    expect(canvas).toContain("dpr={[1, 1.75]}");
    expect(canvas).toContain('"never"');
    expect(canvas).not.toMatch(/EffectComposer|postprocessing/);
  });
  it("robots and sitemap do not list the lab", () => {
    expect(read("src/app/sitemap.ts")).not.toContain("lab");
  });
});
