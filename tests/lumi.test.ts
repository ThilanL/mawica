import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanName, NAME_MAX, sampleGreeting } from "@/components/lumi/greeting";
import { CELEBRATION_SECONDS, celebrationPose, clamp, pointerOffset, seeded } from "@/components/lumi/lumiMath";

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
    expect(maxHop).toBeGreaterThan(0.25);
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
  it("only the Lumi modules import three or react-three-fiber", () => {
    const offenders = files.filter((f) => /from "(three|three\/[a-z/.]+|@react-three\/[a-z-]+)"/.test(readFileSync(f, "utf8")) && !f.includes("/components/lumi/") && !f.includes("/components/cards/premium3d/"));
    expect(offenders).toEqual([]); // the homepage Lumi and the cinematic card are the only 3D code, each in its own folder
  });
  it("nothing outside the lab imports the lab components", () => {
    const offenders = files.filter((f) => /components\/lab\//.test(readFileSync(f, "utf8")) && !f.includes("/components/lab/") && !f.includes("/(lab)/"));
    expect(offenders).toEqual([]);
  });
  it("the homepage section loads the 3D stage only through a dynamic import (never statically)", () => {
    const src = read("src/components/landing/MeetLumi.tsx");
    expect(src).toContain('dynamic(() => import("@/components/lumi/LumiStage")');
    expect(src).toContain("ssr: false");
    // static imports from components/lumi must be types or the pure greeting helpers only
    const staticLumiImports = [...src.matchAll(/^import (?!type)[^;]*from "(@\/components\/lumi\/[A-Za-z]+)";/gm)].map((m) => m[1]);
    expect(staticLumiImports.sort()).toEqual(["@/components/lumi/greeting", "@/components/lumi/lumiMath"]);
    // the 3D stage is only mounted after activation
    expect(src).toMatch(/show3d = activated && !no3d/);
    // nothing else on the public site imports the Lumi runtime
    const offenders = files.filter((f) => /components\/lumi\/(LumiStage|LumiCanvas)/.test(readFileSync(f, "utf8")) && !f.includes("/components/lumi/") && !f.includes("/components/lab/") && !f.endsWith("MeetLumi.tsx"));
    expect(offenders).toEqual([]);
  });
  it("the lab route 404s in production and is noindex", () => {
    expect(read("src/app/(lab)/lab/lumi/page.tsx")).toContain("notFound()");
    expect(read("src/app/(lab)/lab/lumi/page.tsx")).toContain('NODE_ENV === "production"');
    expect(read("src/app/(lab)/layout.tsx")).toContain("index: false");
  });
  it("the lab chunk is lazy-loaded, pauses when hidden and honours reduced motion", () => {
    const lab = read("src/components/lab/LumiLab.tsx");
    expect(lab).toContain("dynamic(() => import(\"@/components/lumi/LumiCanvas\")");
    expect(lab).toContain("IntersectionObserver");
    expect(lab).toContain("visibilitychange");
    expect(lab).toContain("usePrefersReducedMotion");
    const canvas = read("src/components/lumi/LumiCanvas.tsx");
    expect(canvas).toContain("1.75");
    expect(canvas).toContain("dpr={[1, maxDpr]}");
    expect(canvas).toContain('"never"');
    expect(canvas).not.toMatch(/EffectComposer|postprocessing/);
  });
  it("robots and sitemap do not list the lab", () => {
    expect(read("src/app/sitemap.ts")).not.toContain("lab");
  });
});

describe("Lumi name handling", () => {
  it("is optional and falls back to a natural generic greeting", () => {
    expect(sampleGreeting("").line).toBe("A little magic for you.");
    expect(sampleGreeting("   \t ").line).toBe("A little magic for you.");
    expect(sampleGreeting("Ava").line).toBe("A little magic for Ava.");
    expect(sampleGreeting("Ava").body).toMatch(/merry Christmas/);
  });
  it("trims, collapses whitespace and strips trailing punctuation", () => {
    expect(cleanName("  Ava   Rose  ")).toBe("Ava Rose");
    expect(cleanName("Ava!!!")).toBe("Ava");
  });
  it("supports Unicode names, including joiners that Sinhala and emoji need", () => {
    expect(cleanName("Zoë")).toBe("Zoë");
    expect(cleanName("Zoe\u0308".normalize("NFD"))).toBe("Zoë"); // normalised to NFC
    expect(cleanName("සුනේත්‍රා")).toBe("සුනේත්‍රා");
    expect(cleanName("سارة")).toBe("سارة");
    expect(cleanName("👩‍👧 Mum")).toBe("👩‍👧 Mum");
  });
  it("removes control, zero-width-space and bidi override characters", () => {
    expect(cleanName("A\u0000v\u202ea\u200b")).toBe("Ava");
    expect(cleanName("\u2066Ava\u2069")).toBe("Ava");
  });
  it("caps length by code points, never splitting an emoji", () => {
    const long = "😀".repeat(100);
    const out = cleanName(long);
    expect(Array.from(out)).toHaveLength(NAME_MAX);
    expect(out).toBe("😀".repeat(NAME_MAX));
    expect(cleanName("x".repeat(100))).toHaveLength(NAME_MAX);
  });
  it("leaves markup as plain text (React renders it escaped)", () => {
    expect(sampleGreeting("<img src=x onerror=alert(1)>").line).toContain("<img src=x onerror=alert(1)>");
    const src = read("src/components/landing/MeetLumi.tsx");
    expect(src).not.toContain("dangerouslySetInnerHTML");
  });
  it("keeps entered data local: no network calls, storage or URL parameters in the section", () => {
    const src = read("src/components/landing/MeetLumi.tsx");
    expect(src).not.toMatch(/fetch\(|XMLHttpRequest|localStorage|sessionStorage|navigator\.sendBeacon|router\.(push|replace)/);
    expect(src).toContain('href="/create"');
  });
});

describe("Lumi rendering safeguards", () => {
  const canvas = read("src/components/lumi/LumiCanvas.tsx");
  it("renders on demand through a single throttled driver and adapts pixel density", () => {
    expect(canvas).toContain('frameloop={running ? "demand" : "never"}');
    expect(canvas).toContain("cancelAnimationFrame");
    expect(canvas).toContain("setDpr");
    expect(canvas.match(/function Driver\(/g)).toHaveLength(1); // exactly one render driver
    expect(canvas).toContain("window.clearTimeout(timer)");
    expect(canvas).not.toContain('frameloop="always"');
    expect(canvas).toContain("wall-clock time"); // the R3F clock restarts on resume; animation must not depend on it
  });
  it("handles context loss and low-performance devices by falling back", () => {
    expect(canvas).toContain("webglcontextlost");
    expect(canvas).toContain("onLowPerf");
    const stage = read("src/components/lumi/LumiStage.tsx");
    expect(stage).toContain("onLost={fail}");
    expect(stage).toContain("onLowPerf={fail}");
  });
  it("releases WebGL resources it creates", () => {
    expect(canvas).toMatch(/bodyGeo\.dispose\(\); glowTex\.dispose\(\); sparkTex\.dispose\(\)/);
  });
  it("uses smooth shading (welded vertices) rather than faceted extrusion normals", () => {
    expect(canvas).toContain("mergeVertices");
  });
});
