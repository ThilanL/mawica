import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BODY_H, DURATION, LID_H, giftPose } from "@/components/cards/premium3d/stage/cards/gift-model";
import { AR_FROM, AR_HOLD, AR_LENGTH, AR_OPEN, AR_SCALE } from "@/components/cards/premium3d/ar/gift-ar";

const root = process.cwd();
const read = (f: string) => readFileSync(path.join(root, f), "utf8");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

describe("AR-1a: shared gift model", () => {
  it("the opening is a pure function of time: same t, same pose", () => {
    for (const t of [0, 3.3, 5.5, 7.2, DURATION]) expect(giftPose(t)).toEqual(giftPose(t));
  });
  it("the lid never sinks into the box, and the ribbon is gone once it has loosened", () => {
    for (let t = 0; t <= DURATION; t += 0.05) expect(giftPose(t).lid.pos[1]).toBeGreaterThanOrEqual(BODY_H + LID_H / 2 - 0.05);
    expect(giftPose(2.9).ribbon.visible).toBe(true);
    expect(giftPose(5.0).ribbon.visible).toBe(false);
    expect(giftPose(5.0).ribbon.opacity).toBe(0);
  });
  it("the tree card and its AR model share one layout and timeline", () => {
    const card = read("src/components/cards/premium3d/stage/cards/tree.tsx");
    expect(card).toMatch(/from "\.\/tree-model"/);
    expect(card).not.toMatch(/function frondGeometry|rng\(42\)/);
    expect(read("src/components/cards/premium3d/ar/tree-ar.ts")).toMatch(/treeLayout\(TREE_DENSITY\.ar\)/);
  });
  it("the 3D card builds from the shared model (one gift, not two copies)", () => {
    const card = read("src/components/cards/premium3d/stage/cards/gift.tsx");
    expect(card).toMatch(/from "\.\/gift-model"/);
    expect(card).not.toMatch(/function ribbonStrip|function bowLoop/);
  });
});

describe("AR-1a: AR model and files", () => {
  it("a hand-sized box in metres, playing the card's opening then holding", () => {
    expect(AR_SCALE * 2.0).toBeCloseTo(0.3, 5);
    expect(AR_LENGTH).toBeCloseTo(AR_OPEN - AR_FROM + AR_HOLD, 5);
    expect(AR_FROM).toBeLessThan(3.0); // starts before the ribbon loosens
    expect(AR_OPEN).toBeGreaterThanOrEqual(7.4); // and the lid has finished tipping back
  });
  it("the public AR files are generic: no personal greeting text can be in them", () => {
    const files = readdirSync(path.join(root, "public/ar"));
    expect(files.sort()).toEqual(["christmas-tree-still.glb", "christmas-tree-still.usdz", "christmas-tree.glb", "christmas-tree.usdz", "snow-globe-still.glb", "snow-globe-still.usdz", "snow-globe-still.usdz.json", "snow-globe.glb", "snow-globe.usdz", "snow-globe.usdz.json", "special-gift-still.glb", "special-gift-still.usdz", "special-gift.glb", "special-gift.usdz"]);
    for (const f of files) {
      const bytes = readFileSync(path.join(root, "public/ar", f));
      expect(bytes.length, f).toBeLessThan((f.startsWith("snow-globe") ? 7 : f.startsWith("christmas-tree") ? 4 : 3) * 1024 * 1024); // size budget per file (the tree has ~100 animated nodes; the snow globe is a full miniature scene)
      const text = bytes.toString("latin1");
      expect(text).not.toMatch(/recipient|senderName|message|With love/i);
    }
  });
  it("AR code stays out of the card, catalogue and homepage bundles until a later phase loads it on demand", () => {
    const importers = walk(path.join(root, "src")).filter((f) => /\.(tsx?|mjs)$/.test(f) && !f.includes(`${path.sep}lab${path.sep}`) && !f.includes(`${path.sep}ar${path.sep}`));
    for (const f of importers) {
      const src = readFileSync(f, "utf8").replace(/import type [^;]+;/g, ""); // type-only imports are erased from the bundle
      const allowed = f.endsWith(`${path.sep}ArButton.tsx`) ? src.replace(/await import\("\.\/premium3d\/ar\/(webxr|quicklook)"\)/g, "") : src; // the one on-tap dynamic import
      expect(allowed, f).not.toMatch(/premium3d\/ar\/|exporters\/(GLTF|USDZ)Exporter/);
    }
  });
  it("the AR lab exists only in development (404 in production unless ENABLE_LAB=1)", () => {
    expect(read("src/app/(lab)/lab/ar/page.tsx")).toMatch(/NODE_ENV === "production" && process\.env\.ENABLE_LAB !== "1"\) notFound\(\)/);
  });
});

describe("AR: the Christmas tree", () => {
  it("the AR tree is a lighter version of the same tree, lit in the same order", async () => {
    const { TREE_DENSITY, ornamentLit, fairyLit, starOn } = await import("@/components/cards/premium3d/stage/cards/tree-model");
    expect(TREE_DENSITY.ar.levels).toBeLessThan(TREE_DENSITY.mobile.levels);
    expect(TREE_DENSITY.ar.lights).toBeLessThan(TREE_DENSITY.mobile.lights);
    expect(ornamentLit(1.0, 0, 10)).toBe(0); expect(ornamentLit(7.0, 9, 10)).toBe(1); // bottom first, all on before the star
    expect(fairyLit(0.5, 0, 10)).toBe(0); expect(fairyLit(5.4, 9, 10)).toBe(1);
    expect(starOn(6.0)).toBe(0); expect(starOn(7.4)).toBe(1);
  });
  it("is about a metre tall, holds long enough to read the wish, and both cards are offered in AR", async () => {
    const { TREE_SCALE, TREE_LENGTH, TREE_DONE, TREE_FROM } = await import("@/components/cards/premium3d/ar/tree-ar");
    const { TOP_Y } = await import("@/components/cards/premium3d/stage/cards/tree-model");
    expect((TOP_Y + 0.92) * TREE_SCALE).toBeGreaterThan(0.95); expect((TOP_Y + 0.92) * TREE_SCALE).toBeLessThan(1.2);
    expect(TREE_LENGTH - (TREE_DONE - TREE_FROM)).toBeGreaterThanOrEqual(8);
    const { AR_KEYS } = await import("@/components/cards/arSupport");
    expect([...AR_KEYS]).toEqual(["special-gift", "christmas-tree", "snow-globe"]);
  });
});
