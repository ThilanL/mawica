import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BAND, BASE_PROFILE, GLASS_THETA, GLOBE, INNER_R, LAYOUT, PROFILES, WEB_SCALE, bandRadiusAt, groundHeight, innerRadiusAt, reach,
} from "@/components/cards/premium3d/stage/cards/globe-model";

const root = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const kb = (p: string) => statSync(path.join(root, p)).size / 1024;

describe("snow globe model: real-world size and grounding (shared by the web card and AR)", () => {
  it("is 220 mm tall with a 180 mm glass and a 170 mm base", () => {
    expect(GLOBE.centerY + GLOBE.radius).toBeCloseTo(0.22, 6);
    expect(GLOBE.radius * 2).toBeCloseTo(0.18, 6);
    const widest = Math.max(...BASE_PROFILE.flatMap((s) => s.pts.map(([r]) => r)));
    expect(widest * 2).toBeCloseTo(0.17, 4);
    expect(GLOBE.wall).toBeGreaterThan(0.002); expect(INNER_R).toBeCloseTo(GLOBE.radius - GLOBE.wall, 9);
  });
  it("rests exactly on Y = 0 and the base profile is one continuous surface", () => {
    expect(Math.min(...BASE_PROFILE.flatMap((s) => s.pts.map(([, y]) => y)))).toBe(0);
    expect(BASE_PROFILE[0].pts[0]).toEqual([0, 0]); // the underside is closed at the centre
    for (let i = 1; i < BASE_PROFILE.length; i++) expect(BASE_PROFILE[i].pts[0]).toEqual(BASE_PROFILE[i - 1].pts.at(-1));
    expect(BASE_PROFILE.map((s) => s.mat)).toEqual(["gold", "red", "gold"]); // gold foot, red lacquer band, gold upper rim
  });
  it("the glass disappears into the collar (no gap between glass and base)", () => {
    const bottomY = GLOBE.centerY + GLOBE.radius * Math.cos(GLASS_THETA);
    expect(bottomY).toBeLessThan(GLOBE.collarY);
    const lip = BASE_PROFILE[2].pts.at(-1)!;
    expect(Math.hypot(lip[0], lip[1] - GLOBE.centerY)).toBeLessThan(GLOBE.radius); // the lip tucks inside the glass
  });
  it("the decorated band sits on the red lacquer, below the upper rim", () => {
    expect(BAND.y0).toBeGreaterThan(BASE_PROFILE[1].pts[0][1]); expect(BAND.y1).toBeLessThan(BASE_PROFILE[1].pts.at(-1)![1]);
    for (let y = BAND.y0; y <= BAND.y1; y += 0.002) { expect(bandRadiusAt(y)).toBeGreaterThan(0.074); expect(bandRadiusAt(y)).toBeLessThan(0.0815); }
  });
});

describe("the miniature world fits inside the glass", () => {
  it("has every element of the reference scene", () => {
    const ids = LAYOUT.map((l) => l.id);
    for (const id of ["cottage", "tree", "snowman", "reindeer", "lantern", "present-a"]) expect(ids).toContain(id);
    expect(ids.filter((i) => i.startsWith("pine")).length).toBeGreaterThanOrEqual(3);
  });
  it.each(LAYOUT.map((l) => [l.id, l] as const))("%s stays at least 2 mm clear of the inner glass", (_, p) => {
    expect(reach(p)).toBeLessThan(INNER_R - 0.002);
  });
  it("the snow ground lies inside the glass everywhere and above the collar", () => {
    for (let a = 0; a < Math.PI * 2; a += 0.2) for (let r = 0; r <= 0.06; r += 0.005) {
      const x = Math.sin(a) * r, z = Math.cos(a) * r, y = groundHeight(x, z);
      expect(y).toBeGreaterThan(GLOBE.collarY); expect(y).toBeLessThan(GLOBE.centerY);
      expect(innerRadiusAt(y)).toBeGreaterThan(0.05);
    }
  });
  it("the tree is the tallest element and its star stays below the top of the glass", () => {
    const tree = LAYOUT.find((l) => l.id === "tree")!;
    expect(Math.max(...LAYOUT.map((l) => l.height))).toBe(tree.height);
    expect(groundHeight(...tree.at) + tree.height * 1.04).toBeLessThan(GLOBE.height - 0.02);
  });
});

describe("quality profiles and shipped assets", () => {
  it("desktop is the richest profile, AR the lightest, and AR uses glass Quick Look can show", () => {
    expect(PROFILES.desktop.glass).toBe("transmission"); expect(PROFILES.mobile.glass).toBe("fresnel"); expect(PROFILES.ar.glass).toBe("opacity");
    expect(PROFILES.desktop.tree.levels).toBeGreaterThan(PROFILES.mobile.tree.levels); expect(PROFILES.mobile.tree.levels).toBeGreaterThan(PROFILES.ar.tree.levels);
    expect(PROFILES.ar.shadows).toBe(0); expect(PROFILES.mobile.shadows).toBe(0);
    expect(WEB_SCALE).toBeGreaterThan(10);
  });
  it("the authored models and textures are present and within budget", () => {
    const budget: Record<string, number> = { "cottage.glb": 2048, "reindeer.glb": 900, "lantern.glb": 300, "tex/env.hdr": 450, "tex/snow_color.webp": 120, "tex/snow_normal.webp": 160, "tex/snow_arm.webp": 120 };
    for (const [f, max] of Object.entries(budget)) {
      const p = `public/models/snow-globe/${f}`;
      if (f === "reindeer.glb" && !existsSync(path.join(root, p))) continue; // added with the reindeer asset
      expect(existsSync(path.join(root, p)), p).toBe(true); expect(kb(p), p).toBeLessThan(max);
    }
  });
  it("every CC BY asset is credited, and the credit is public", () => {
    const credits = read("public/models/snow-globe/CREDITS.md");
    for (const s of ["Scandinavian Log Cabin", "rivetech", "CC BY 4.0", "street_lamp_01", "CC0"]) expect(credits).toContain(s);
    expect(read("src/app/(site)/terms/page.tsx")).toMatch(/models\/snow-globe\/CREDITS\.md|3D model credits/);
  });
  it("the asset pipeline is reproducible (scripted, sources kept out of git)", () => {
    expect(read("scripts/globe/process_assets.py")).toMatch(/def cottage\(ar=False\)/);
    expect(read(".gitignore")).toMatch(/\/assets-src\//);
  });
});

describe("Stage C animation (pure motion model)", async () => {
  const M = await import("@/components/cards/premium3d/stage/cards/globe/motion");
  const dist = (x: number, y: number, z: number) => Math.hypot(x, y - GLOBE.centerY, z);
  it("snow is deterministic and every flake's column fits inside the glass", () => {
    const a = M.makeFlakes(400), b = M.makeFlakes(400);
    expect(a).toEqual(b); expect(a.length).toBe(400);
    expect(a.filter((f) => f.glitter).length).toBeGreaterThan(20);
  });
  it("no flake ever leaves the glass or sinks below the snow, calm or in a storm, at any moment", () => {
    const flakes = M.makeFlakes(400), o = [0, 0, 0, 0];
    for (const f of flakes) for (let t = 0; t < 120; t += 1.37) for (const age of [-1, 0.1, 0.4, 1, 3, 6, 10, 14]) {
      const e = M.stormEnergy(age);
      M.flakeAt(f, t, e, age, o);
      expect(dist(o[0], o[1], o[2])).toBeLessThan(INNER_R - 0.002);
      expect(o[1]).toBeGreaterThanOrEqual(f.rest - 1e-9);
      expect(o[3]).toBeGreaterThanOrEqual(0); expect(o[3]).toBeLessThanOrEqual(1);
    }
  });
  it("a snowstorm swirls up quickly and settles back to calm snowfall", () => {
    expect(M.stormEnergy(-0.5)).toBe(0); expect(M.stormEnergy(0)).toBe(0);
    expect(M.stormEnergy(0.4)).toBeCloseTo(1, 5);
    expect(M.stormEnergy(4)).toBeLessThan(0.3); expect(M.stormEnergy(12)).toBeLessThan(0.02); expect(M.stormEnergy(M.STORM_SETTLE)).toBe(0);
    // with no energy the storm path is exactly the calm path
    const f = M.makeFlakes(1)[0], a = [0, 0, 0, 0], b = [0, 0, 0, 0];
    M.flakeAt(f, 7.3, 0, 99, a); M.flakeAt(f, 7.3, M.stormEnergy(99), 99, b); expect(b).toEqual(a);
  });
  it("chimney smoke rises, fades and stays inside the glass", () => {
    const o = [0, 0, 0, 0, 0], at = [-0.003, 0.1256, -0.027] as const;
    for (let t = 0; t < 30; t += 0.21) for (let i = 0; i < M.SMOKE.count; i++) {
      M.smokeAt(i, M.SMOKE.count, t, at, o);
      expect(dist(o[0], o[1], o[2])).toBeLessThan(INNER_R - 0.004);
      expect(o[1]).toBeGreaterThanOrEqual(at[1] - 1e-9); expect(o[3]).toBeLessThanOrEqual(0.2 + 1e-9);
    }
  });
  it("the village lights come on in order (windows, lantern, garland, star) and are all on when the intro ends", () => {
    const first = (fn: (t: number) => number) => { for (let t = 0; t < 12; t += 0.05) if (fn(t) > 0.5) return t; return 99; };
    const w = first(M.windowsOn), l = first(M.lanternOn), g = first((t) => M.treeLightOn(t, 0, 100)), s = first(M.starOn);
    expect(w).toBeLessThan(l); expect(l).toBeLessThan(g); expect(g).toBeLessThan(s);
    const T = M.GLOBE_DURATION;
    expect([M.windowsOn(T), M.lanternOn(T), M.treeLightOn(T, 99, 100), M.starOn(T)]).toEqual([1, 1, 1, 1]);
    expect(M.INTRO.storm).toBeLessThan(T);
  });
  it("ambient variation is subtle: flicker ±5%, twinkle 55–100%, star 85–100%", () => {
    for (let t = 0; t < 200; t += 0.13) {
      expect(Math.abs(M.flicker(t, 1.3) - 1)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(M.twinkle(t, 7)).toBeGreaterThanOrEqual(0.55 - 1e-9); expect(M.twinkle(t, 7)).toBeLessThanOrEqual(1 + 1e-9);
      expect(M.starGlow(t)).toBeGreaterThanOrEqual(0.85 - 1e-9);
    }
  });
  it("interaction, sound and bloom are scoped: snow globe only, sound off by default, bloom desktop only, still frame for reduced motion", async () => {
    const { STAGE_INTERACTIVE } = await import("@/components/cards/premium3d/stage/Stage");
    expect(Object.keys(STAGE_INTERACTIVE)).toEqual(["snow-globe"]);
    const stage = read("src/components/cards/premium3d/stage/Stage.tsx");
    expect(stage).toMatch(/useState\(false\)/); expect(stage).toMatch(/interactive && choice === "webgl"/); // no hint or toggle in the reduced-motion still or the 2D fallback
    const world = read("src/components/cards/premium3d/stage/cards/globe/GlobeWorld.tsx");
    expect(world).toMatch(/bloom = profile === "desktop"/); expect(world).toMatch(/if \(mode !== "play"\) return;/); expect(world).toMatch(/if \(sh\.sound\) playShimmer/);
    expect(read("src/components/cards/premium3d/stage/cards/globe/sound.ts")).not.toMatch(/\.mp3|\.ogg|\.m4a|fetch\(/); // synthesised, nothing downloaded
  });
});

describe("Stage D personalisation", async () => {
  const { engravingLines, ENGRAVING_NAME_MAX } = await import("@/components/cards/premium3d/stage/cards/globe/engraving");
  const { graphemes } = await import("@/components/cards/premium3d/ar/wish");
  it("engraves the card's own names: 'For {recipient}' and 'With love, {sender}'", () => {
    expect(engravingLines("Nadia", "Sam")).toEqual(["For Nadia", "With love, Sam"]);
    expect(engravingLines("  Ava  ", "")).toEqual(["For Ava"]);
    expect(engravingLines("", "")).toEqual([]); // thumbnails and empty previews: just the gold frame
  });
  it("long names are shortened by grapheme to fit the plate, keeping accents whole", () => {
    const [toLine, fromLine] = engravingLines("Maximiliana Alessandrina Josephine", "The Fernández-Ortega family of Ávila");
    const to = toLine.slice(4), from = fromLine.slice("With love, ".length);
    expect(graphemes(to).length).toBeLessThanOrEqual(ENGRAVING_NAME_MAX); expect(to.endsWith("…")).toBe(true);
    expect(from).toContain("Fernández"); expect(graphemes(from).length).toBeLessThanOrEqual(ENGRAVING_NAME_MAX);
  });
  it("emoji are left out of the engraving (a single-colour cut-out cannot show them), and an emoji-only name engraves nothing", () => {
    expect(engravingLines("👨‍👩‍👧‍👦 The Ortegas 🎄", "Sam ❤️")).toEqual(["For The Ortegas", "With love, Sam"]);
    expect(engravingLines("🎅🏽", "🇱🇰")).toEqual([]);
  });
  it("right-to-left names keep the phrase order and their own letters", () => {
    expect(engravingLines("نادية", "סם")).toEqual(["For نادية", "With love, סם"]);
    expect(read("src/components/cards/premium3d/stage/cards/globe/textures.ts")).toMatch(/x\.direction = "ltr"/);
  });
  it("no recipient or sender name is hard-coded in the card's code", () => {
    for (const f of ["globe.tsx", "globe/build.ts", "globe/GlobeWorld.tsx", "globe/engraving.ts", "globe/textures.ts"]) expect(read(`src/components/cards/premium3d/stage/cards/${f}`), f).not.toMatch(/Nadia|"Sam"|'Sam'/);
  });
  it("names flow from the card to the engraving, and changing them redraws only the plate (no model rebuild while typing)", () => {
    expect(read("src/components/cards/premium3d/stage/Stage.tsx")).toMatch(/text=\{names\}/);
    expect(read("src/components/cards/premium3d/stage/StageCanvas.tsx")).toMatch(/<Scene shared=\{shared\} mobile=\{mobile\} mode=\{mode\} text=\{text\} \/>/);
    const world = read("src/components/cards/premium3d/stage/cards/globe/GlobeWorld.tsx");
    expect(world).toMatch(/\}, \[gl, invalidate, profile\]\);/); // the build does not depend on the names
    expect(world).toMatch(/parts\.setEngraving\(/);
    expect(read("src/components/cards/premium3d/stage/cards/globe/build.ts")).toMatch(/setEngraving\(lines: string\[\]\) \{/);
  });
  it("the intro opens on the engraving at the back of the base and ends on the front hero view", async () => {
    const { def } = await import("@/components/cards/premium3d/stage/cards/globe");
    const start = def.camera(0.5, 0.56), end = def.camera(def.duration, 0.56);
    expect(start.pos.z).toBeLessThan(0); expect(end.pos.z).toBeGreaterThan(0); // behind the globe, then in front of it
    expect(start.look.y).toBeLessThan(end.look.y); // first the plate on the base, then the glass
  });
  it("the golden message reveal is scoped to the snow globe and still for reduced motion", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const Globe = (await import("@/components/cards/premium3d/stage/entries/globe")).default;
    const Tree = (await import("@/components/cards/premium3d/stage/entries/tree")).default;
    const p = { recipientName: "Ava", senderName: "Sam", message: "Hi", greeting: "Merry Christmas", replayKey: 0 };
    expect(renderToStaticMarkup(createElement(Globe, p))).toMatch(/class="stg-panel[^"]*stg-gold/);
    expect(renderToStaticMarkup(createElement(Tree, p))).not.toMatch(/stg-gold/);
    const css = read("src/app/globals.css");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.stg-gold::before, \.stg-gold \.stg-greeting[^}]*animation: none !important;/);
  });
});

describe("Stage E augmented reality", async () => {
  const { unzipSync } = await import("three/addons/libs/fflate.module.js");
  const { replaceInUsdz } = await import("@/components/cards/premium3d/ar/globe-usdz");
  const file = (p: string) => new Uint8Array(readFileSync(path.join(root, p)));
  /** Offsets of every stored file's data in a zip (Quick Look requires each to be a multiple of 64). */
  const dataOffsets = (z: Uint8Array) => {
    const v = new DataView(z.buffer, z.byteOffset, z.byteLength), out: { name: string; at: number; size: number }[] = [];
    for (let o = 0; v.getUint32(o, true) === 0x04034b50;) {
      const size = v.getUint32(o + 18, true), n = v.getUint16(o + 26, true), x = v.getUint16(o + 28, true), at = o + 30 + n + x;
      out.push({ name: new TextDecoder().decode(z.subarray(o + 30, o + 30 + n)), at, size }); o = at + size;
    }
    return out;
  };
  it("the snow globe has a View in AR button (Android WebXR, iPhone Quick Look, desktop QR, in-app help), like the gift and the tree", async () => {
    const { AR_KEYS, isArKey } = await import("@/components/cards/arSupport");
    expect([...AR_KEYS]).toContain("snow-globe"); expect(isArKey("snow-globe")).toBe(true);
    expect(read("src/components/cards/premium3d/ar/model.ts")).toMatch(/if \(key === "snow-globe"\) return \(await import\("\.\/globe-ar"\)\)\.buildGlobeAR/);
    expect(read("src/components/cards/premium3d/ar/quicklook.ts")).toMatch(/if \(key === "snow-globe"\) return \(await import\("\.\/globe-usdz"\)\)\.exportGlobeUSDZ/);
  });
  it.each([["snow-globe", 7200, 3400], ["snow-globe-still", 6800, 3300]] as const)("%s: generic files exist within budget, with a manifest naming the two personal textures", (name, usdzKB, glbKB) => {
    const usdz = file(`public/ar/${name}.usdz`), manifest = JSON.parse(read(`public/ar/${name}.usdz.json`));
    expect(usdz.length / 1024).toBeLessThan(usdzKB); expect(file(`public/ar/${name}.glb`).length / 1024).toBeLessThan(glbKB);
    expect(manifest.version).toBe(1); expect(manifest.bytes).toBe(usdz.length); expect(manifest.engraving).not.toBe(manifest.wish);
    const names = Object.keys(unzipSync(usdz));
    expect(names[0]).toBe("model.usda"); expect(names).toContain(manifest.engraving); expect(names).toContain(manifest.wish);
    for (const d of dataOffsets(usdz)) expect(d.at % 64, d.name).toBe(0);
    const text = new TextDecoder().decode(unzipSync(usdz)["model.usda"]);
    expect(text).toMatch(/metersPerUnit = 1/); expect(text).toMatch(/upAxis = "Y"/); expect(text).not.toMatch(/\bNadia\b|\bSam\b/); // generic: nothing personal
  });
  it("personalising swaps only the two pictures and keeps the file valid for Quick Look (stored, model first, 64-byte aligned)", () => {
    const usdz = file("public/ar/snow-globe.usdz"), m = JSON.parse(read("public/ar/snow-globe.usdz.json"));
    const a = new Uint8Array(1000).fill(7), b = new Uint8Array(333).fill(9);
    const out = replaceInUsdz(usdz, { [m.engraving]: a, [m.wish]: b }), files = unzipSync(out), before = unzipSync(usdz);
    expect(Object.keys(files)).toEqual(Object.keys(before));
    expect(files[m.engraving]).toEqual(a); expect(files[m.wish]).toEqual(b);
    for (const k of Object.keys(before)) if (k !== m.engraving && k !== m.wish) expect(files[k].length, k).toBe(before[k].length);
    for (const d of dataOffsets(out)) expect(d.at % 64, d.name).toBe(0);
    expect(() => replaceInUsdz(usdz, { "textures/missing.png": a })).toThrow();
  });
  it("the AR model is the same globe at real size, with a smaller wish card beside it, live snow and storm on Android only", () => {
    const src = read("src/components/cards/premium3d/ar/globe-ar.ts");
    expect(src).toMatch(/buildSnowGlobe\(\{ profile: "ar"/); expect(src).toMatch(/shadow: 0\.3/); expect(src).toMatch(/scale: 0\.6/);
    expect(src).toMatch(/onTap\(\) \{ stormAt = clock; \}/); expect(src).toMatch(/created on first use, so the iPhone export never pays for them/);
    const xr = read("src/components/cards/premium3d/ar/webxr.ts");
    expect(xr).toMatch(/model\.onTap\(\)/); expect(xr).toMatch(/model\.shadow \?\? 0\.62/); // other cards keep their shadow and have no tap action
    expect(read("src/components/cards/premium3d/stage/cards/globe/build.ts")).toMatch(/if \(o\.profile === "ar"\) prepareForAR\(root, keep\);/);
  });
});

describe("Stage F optimisation, thumbnails and fallback", () => {
  const glbJson = (p: string) => { const b = readFileSync(path.join(root, p)); return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString("utf8")); };
  it.each(["cottage", "reindeer", "lantern", "cottage-ar", "reindeer-ar", "lantern-ar"])("%s.glb: geometry is meshopt-compressed and at most one UV set is shipped", (name) => {
    const j = glbJson(`public/models/snow-globe/${name}.glb`);
    expect(j.extensionsUsed).toContain("EXT_meshopt_compression");
    for (const m of j.meshes) for (const p of m.primitives) expect(Object.keys(p.attributes).filter((a: string) => a.startsWith("TEXCOORD_") && a !== "TEXCOORD_0")).toEqual([]); // (the remeshed roof snow has none)
    expect(read("src/components/cards/premium3d/stage/cards/globe/build.ts")).toMatch(/setMeshoptDecoder\(MeshoptDecoder\)/);
  });
  it("the web models, environment map and textures download within 2 MB in total (models 1.4 MB)", () => {
    const files = ["cottage.glb", "reindeer.glb", "lantern.glb", "tex/env.hdr", "tex/snow_color.webp", "tex/snow_normal.webp", "tex/snow_arm.webp"];
    expect(files.reduce((n, f) => n + kb(`public/models/snow-globe/${f}`), 0)).toBeLessThan(2000);
    expect(["cottage.glb", "reindeer.glb", "lantern.glb"].reduce((n, f) => n + kb(`public/models/snow-globe/${f}`), 0)).toBeLessThan(1450);
  });
  it("phones use smaller generated textures; AR uses the lightest profile", () => {
    expect(PROFILES.mobile.tex).toBe(512); expect(PROFILES.ar.tex).toBe(256); expect(PROFILES.ar.assetSuffix).toBe("-ar");
  });
  it("the catalogue thumbnail is rendered from the 3D model, like the other five cards", () => {
    const script = read("scripts/render-catalogue.mjs");
    expect(script).not.toMatch(/globe@2x/); expect(script).toMatch(/const HERO = \{ "snow-globe": 10\.5/);
  });
  it("the 2D fallback shows a still of the 3D model, and the homepage hero keeps its own artwork", () => {
    const scene = read("src/components/cards/scenes/SnowGlobeScene.tsx");
    expect(scene).toMatch(/\/art\/cards\/snow-globe-3d\.webp/); expect(scene).not.toMatch(/heroArtwork/);
    expect(kb("public/art/cards/snow-globe-3d.webp")).toBeLessThan(250); expect(kb("public/art/cards/snow-globe-3d-sm.webp")).toBeLessThan(100);
    expect(read("src/content/hero.ts")).toMatch(/src: "\/art\/hero\/snow-globe-mawica\.webp"/); // untouched
  });
  it("the visual regression check is scripted (its baselines are kept locally, not in git; the first run creates them)", () => {
    const script = read("scripts/globe/visual-regression.mjs");
    expect(script).toMatch(/THRESHOLD/); expect(script).toMatch(/if \(update \|\| !existsSync\(base\)\)/);
    expect(read(".gitignore")).toMatch(/\/docs\/screenshots\/snow-globe\//);
  });
});
