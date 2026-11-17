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
    expect(files.sort()).toEqual(["special-gift-still.glb", "special-gift-still.usdz", "special-gift.glb", "special-gift.usdz"]);
    for (const f of files) {
      const bytes = readFileSync(path.join(root, "public/ar", f));
      expect(bytes.length).toBeLessThan(3 * 1024 * 1024); // size budget per file
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
