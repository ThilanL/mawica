import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STAGE_DURATION } from "@/components/cards/premium3d/stage/Stage";
import { STAGE_BACKDROP, STAGE_BG, STAGE_LOADERS } from "@/components/cards/premium3d/stage/loaders";
import { scenes } from "@/components/cards/scenes";
import { createCardSchema } from "@/modules/cards/schema";
import { TEMPLATE_KEYS, templateTier } from "@/modules/templates/registry";
import ChristmasTree from "@/components/cards/premium3d/stage/entries/tree";
import Gift from "@/components/cards/premium3d/stage/entries/gift";
import Window from "@/components/cards/premium3d/stage/entries/window";
import NewYear from "@/components/cards/premium3d/stage/entries/newyear";
import Glasses from "@/components/cards/premium3d/stage/entries/glasses";
import Globe from "@/components/cards/premium3d/stage/entries/globe";

const root = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const THREE_KEYS = ["christmas-tree", "special-gift", "warm-wishes", "new-year-2027", "new-year-celebration"] as const;

describe("saved-card compatibility", () => {
  it("the six template ids and names are unchanged, all STANDARD (free), and old payloads still validate", () => {
    expect([...TEMPLATE_KEYS]).toEqual(["snow-globe", "christmas-tree", "special-gift", "warm-wishes", "new-year-2027", "new-year-celebration"]);
    expect(Object.keys(scenes)).toEqual([...TEMPLATE_KEYS]);
    for (const k of TEMPLATE_KEYS) {
      expect(templateTier(k)).toBe("STANDARD");
      expect(createCardSchema.safeParse({ templateKey: k, recipientName: "Ava", senderName: "Sam", message: "Hello", musicTrackId: "none" }).success).toBe(true);
    }
    const names = read("src/modules/templates/registry.ts");
    for (const t of ["Christmas Snow Globe", "Magical Christmas Tree", "A Special Gift", "Warm Christmas Wishes", "New Year 2027", "New Year Celebration"]) expect(names).toContain(`title: "${t}"`);
  });
  it("every scene is still its own lazy chunk (a page only downloads the card it shows)", () => {
    const src = read("src/components/cards/scenes/index.ts");
    for (const k of TEMPLATE_KEYS) expect(src).toMatch(new RegExp(`"${k}": dynamic\\(\\(\\) => import\\("\\.\\./premium3d/stage/entries/`));
  });
});

describe("the catalogue never loads three.js", () => {
  const files = walk(path.join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
  it("thumbnails are plain <img> markup: CardArt and its consumers import no 3D code", () => {
    const art = read("src/components/landing/CardArt.tsx");
    expect(art.split("\n").filter((l) => /^import\b/.test(l)).join("\n")).not.toMatch(/three|premium3d|react-three|dynamic/);
    expect(art).not.toMatch(/dynamic\(/);
    expect(art).toMatch(/loading="lazy"/);
    expect(art).toMatch(/srcSet=/);
    for (const f of ["src/components/landing/CardPreviews.tsx", "src/components/landing/RecipientShowcase.tsx"]) expect(read(f)).not.toMatch(/premium3d|from "three|react-three/);
    // landing components never import the stage statically
    const landing = files.filter((f) => f.includes("src/components/landing/"));
    for (const f of landing) expect(readFileSync(f, "utf8").split("\n").filter((l) => /^import\b/.test(l)).join("\n"), f).not.toMatch(/premium3d|three/);
  });
  it("three.js is imported only inside components/lumi and components/cards/premium3d", () => {
    const off = files.filter((f) => /from "(three|three\/[a-z/.]+|@react-three\/[a-z-]+)"/.test(readFileSync(f, "utf8")) && !/components\/(lumi|cards\/premium3d)\//.test(f));
    expect(off).toEqual([]);
  });
  it("the stage canvas (three.js) is reachable only through a dynamic import, and each card's model through its own loader", () => {
    expect(read("src/components/cards/premium3d/stage/Stage.tsx")).toMatch(/dynamic\(\(\) => import\("\.\/StageCanvas"\), \{ ssr: false \}\)/);
    const importers = files.filter((f) => /["']\.\/StageCanvas["']/.test(readFileSync(f, "utf8"))).map((f) => path.relative(root, f));
    expect(importers).toEqual(["src/components/cards/premium3d/stage/Stage.tsx"]);
    expect(Object.keys(STAGE_LOADERS).sort()).toEqual([...THREE_KEYS].sort());
    for (const l of Object.values(STAGE_LOADERS)) expect(typeof l).toBe("function");
    expect(read("src/components/cards/premium3d/stage/loaders.ts")).toMatch(/import\("\.\/cards\/tree"\)/);
  });
});

describe("catalogue thumbnails (optimised, consistent aspect, small)", () => {
  const RATIOS = { "16x10": { w: [640, 1280], ratio: 1.6 }, "4x5": { w: [480, 960], ratio: 0.8 }, "9x17": { w: [360, 720], ratio: 9 / 17 } } as const;
  it("every card has WebP files for every ratio and size, with the right aspect, each under 100 KB, 1.5 MB in total", async () => {
    let total = 0;
    for (const k of TEMPLATE_KEYS) for (const [name, r] of Object.entries(RATIOS)) for (const w of r.w) {
      const f = path.join(root, "public/art/catalogue", `${k}-${name}-${w}.webp`);
      expect(existsSync(f), f).toBe(true);
      const size = statSync(f).size; total += size;
      expect(size, `${k}-${name}-${w}`).toBeLessThan(100 * 1024);
      const m = await sharp(f).metadata();
      expect(m.format).toBe("webp");
      expect(m.width).toBe(w);
      expect(m.width! / m.height!).toBeCloseTo(r.ratio, 1);
    }
    expect(total).toBeLessThan(1.5 * 1024 * 1024);
  });
  it("CardArt renders a responsive, lazy, decorative image with explicit dimensions (no layout shift)", async () => {
    const { CardArt } = await import("@/components/landing/CardArt");
    const html = renderToStaticMarkup(<CardArt theme="christmas-tree" ratio="16x10" className="aspect-[16/10]" />);
    expect(html).toContain('src="/art/catalogue/christmas-tree-16x10-1280.webp"');
    expect(html).toContain("/art/catalogue/christmas-tree-16x10-640.webp 640w");
    expect(html).toContain('loading="lazy"'); expect(html).toContain('decoding="async"'); expect(html).toContain('alt=""'); expect(html).toContain('width="1280"'); expect(html).toContain('height="800"'); expect(html).toContain('aria-hidden="true"');
  });
});

describe("each 3D card: camera, timing and framing (pure)", () => {
  it.each(THREE_KEYS)("%s: camera is finite and sane for every phone and desktop aspect and time", async (key) => {
    const { def } = await STAGE_LOADERS[key]!();
    expect(def.duration).toBe(STAGE_DURATION[key]);
    expect(def.heroT).toBeGreaterThan(0.5); expect(def.heroT).toBeLessThan(def.duration);
    for (const a of [0.46, 0.56, 0.75, 1, 1.6, 2.1]) {
      expect(def.lift(a)).toBeGreaterThanOrEqual(0); expect(def.lift(a)).toBeLessThanOrEqual(0.3);
      for (let t = 0; t <= def.duration + 30; t += 0.7) {
        const c = def.camera(t, a);
        for (const v of [c.pos.x, c.pos.y, c.pos.z, c.look.x, c.look.y, c.look.z]) expect(Number.isFinite(v)).toBe(true);
        expect(c.pos.y).toBeGreaterThan(0.2); // never below the ground
        expect(Math.hypot(c.pos.x - c.look.x, c.pos.y - c.look.y, c.pos.z - c.look.z)).toBeGreaterThan(3);
      }
    }
    expect(JSON.stringify(def.camera(3.3, 0.5))).toBe(JSON.stringify(def.camera(3.3, 0.5))); // deterministic: seek and replay are safe
  });
  it("the camera moves smoothly (no jump larger than a small step between adjacent frames)", async () => {
    for (const key of THREE_KEYS) {
      const { def } = await STAGE_LOADERS[key]!();
      let prev = def.camera(0, 0.56);
      for (let t = 0.05; t <= def.duration + 5; t += 0.05) {
        const c = def.camera(t, 0.56);
        expect(Math.hypot(c.pos.x - prev.pos.x, c.pos.y - prev.pos.y, c.pos.z - prev.pos.z), `${key} @${t.toFixed(2)}`).toBeLessThan(0.6);
        prev = c;
      }
    }
  });
  it("New Year 2027 has a countdown and the others do not (the countdown is DOM text, so it stays readable)", () => {
    const src = read("src/components/cards/premium3d/stage/Stage.tsx");
    expect(src).toContain('sceneKey === "new-year-2027"');
    expect(src).toMatch(/stg-count/);
  });
});

describe("shell: message, ending, fallback and motion", () => {
  const props = { recipientName: "Nadia <b>", senderName: "Sam", message: "Hello <img src=x onerror=alert(1)>\nLine two", replayKey: 0, greeting: "Merry Christmas" };
  const entries = { "christmas-tree": ChristmasTree, "special-gift": Gift, "warm-wishes": Window, "new-year-2027": NewYear, "new-year-celebration": Glasses } as const;
  it.each(Object.entries(entries))("%s server-renders the personal message as escaped real text with the Mawica ending (works without JavaScript or WebGL)", (key, Entry) => {
    const html = renderToStaticMarkup(<Entry {...props} />);
    expect(html).toContain("Nadia &lt;b&gt;"); expect(html).toContain("Hello &lt;img src=x onerror=alert(1)&gt;"); expect(html).toContain("With love, Sam"); expect(html).not.toContain("<img src=x");
    expect(html).toContain("BRING YOUR WISHES TO LIFE."); expect(html).toContain("Send your feelings to others."); expect(html).toContain("www.mawica.com"); expect(html).toContain('href="/create"');
    expect(html).toContain(`data-scene="${key}"`);
    expect(STAGE_BG[key]).toContain("gradient"); // a plum backdrop is there before any JavaScript runs
    // the message sheet and the ending are siblings: the Create button is never inside the message
    const sheet = html.indexOf('class="stg-panel'), end = html.indexOf('class="cin-end');
    expect(sheet).toBeGreaterThan(-1); expect(end).toBeGreaterThan(sheet);
    expect(html.slice(sheet, end)).not.toContain("Create your own card");
  });
  it("the 3D scene paints its own opaque backdrop (additive light is lost over a transparent canvas on real GPUs), from the same definition as the CSS one", () => {
    const canvas = readFileSync(path.join(process.cwd(), "src/components/cards/premium3d/stage/StageCanvas.tsx"), "utf8");
    expect(canvas).toMatch(/scene\.background = backdropTexture\(STAGE_BACKDROP\[sceneKey\]\)/);
    for (const key of Object.keys(entries)) { expect(STAGE_BACKDROP[key].stops.length).toBeGreaterThanOrEqual(2); expect(STAGE_BG[key]).toContain(STAGE_BACKDROP[key].stops[0][0]); }
  });
  it("visual-polish guards: the celebration rims meet exactly, the gift lid clears the box, fireworks are seekable", () => {
    const src = (f: string) => readFileSync(path.join(process.cwd(), "src/components/cards/premium3d/stage/cards", f), "utf8");
    expect(src("glasses.tsx")).toMatch(/touchGap\(TOUCH_TILT\)/); // the gap at the clink is derived from the flute's geometry, not tuned by eye
    expect(src("newyear.tsx")).toMatch(/function burstAt\(slot: number, round: number\)/); // pure function of time: thumbnails and seeks show the real show
    expect(src("newyear.tsx")).not.toMatch(/fwVel/); // no integrated state left
    expect(src("window.tsx")).toMatch(/mountainTexture/); expect(src("window.tsx")).toMatch(/moonTexture/); expect(src("window.tsx")).toMatch(/pineGeometry/);
  });
  it("the snow globe keeps its artwork and gains the same ending, hidden until Continue", () => {
    const html = renderToStaticMarkup(<Globe {...props} />);
    expect(html).toContain("With love, Sam"); expect(html).toContain("BRING YOUR WISHES TO LIFE."); expect(html).toMatch(/class="cin-end[^"]*"[^>]*aria-hidden="true"/);
  });
  it("never redirects, and keeps scene code free of automatic navigation", () => {
    for (const f of ["Stage.tsx", "LegacyEnding.tsx"]) expect(read(`src/components/cards/premium3d/stage/${f}`)).not.toMatch(/router\.(push|replace)|location\.(href|assign|replace)\s*=/);
  });
  it("reduced motion: the finished scene is a single static frame and the sheet appears with no transition", () => {
    const stage = read("src/components/cards/premium3d/stage/Stage.tsx");
    expect(stage).toContain('chooseRenderer'); expect(stage).toMatch(/webgl-static/);
    const css = read("src/app/globals.css");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.stg-panel \{ transition: none; \} \.stg-count \{ animation: none; \} \}/);
  });
  it("low-power and failure paths fall back to the CSS scene (never a blank card)", () => {
    const stage = read("src/components/cards/premium3d/stage/Stage.tsx");
    expect(stage).toMatch(/fallback-2d/); expect(stage).toMatch(/onLowPerf/); expect(stage).toMatch(/onLost/); expect(stage).toMatch(/<Fallback \{\.\.\.props\} \/>/);
    for (const f of ["tree", "gift", "window", "newyear", "glasses"]) expect(read(`src/components/cards/premium3d/stage/entries/${f}.tsx`)).toMatch(/withEnding\(/);
  });
  it("scenes stop rendering when hidden and after they rest, release GPU objects, and cap pixel ratio", () => {
    const canvas = read("src/components/cards/premium3d/stage/StageCanvas.tsx");
    expect(canvas).toMatch(/frameloop=\{enabled \? "demand" : "never"\}/); expect(canvas).toMatch(/25000/); expect(canvas).toMatch(/dpr=\{\[1, maxDpr\]\}/); expect(canvas).toMatch(/setDpr/);
    const stage = read("src/components/cards/premium3d/stage/Stage.tsx");
    expect(stage).toMatch(/IntersectionObserver/); expect(stage).toMatch(/visibilitychange/);
    for (const f of ["tree", "gift", "window", "newyear", "glasses"]) expect(read(`src/components/cards/premium3d/stage/cards/${f}.tsx`)).toMatch(/dispose\(/);
  });
});
