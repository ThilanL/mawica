import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CinematicScene } from "@/components/cards/premium3d/CinematicScene";
import { AMBIENT, DEFAULT_AMBIENT, layerCount, presetById, totalParticles } from "@/components/cards/premium3d/ambient";
import { fitAspect, FRAME_MAX } from "@/components/cards/premium3d/MediaFrame";
import { autoAdvanceSeconds, chooseRenderer } from "@/components/cards/premium3d/support";
import { DIM, FOV, READ, T, easeInOutCubic, fitDistance, pageRect, poseAt, readingCamera, rotateXYZ } from "@/components/cards/premium3d/timeline";
import { premiumScenes } from "@/components/cards/scenes";
import { cardPreviews } from "@/content/site";
import { MEDIA_TEMPLATE_KEYS, TEMPLATE_KEYS, premiumTemplates, templateAllowsMedia, templateTier } from "@/modules/templates/registry";

const root = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

describe("cinematic card registration", () => {
  it("is a separate premium template next to the existing 2D Lumi's Wish, which is untouched", () => {
    expect(templateTier("lumis-wish-cinema")).toBe("PREMIUM"); // same credit rule: 1 total + 1 premium, no new credit type
    expect(Object.keys(premiumScenes)).toEqual(["lumis-wish", "lumis-wish-cinema"]);
    expect(read("src/components/cards/scenes/index.ts")).toContain('"lumis-wish": dynamic(() => import("./LumisWishScene")');
    expect(TEMPLATE_KEYS).toHaveLength(6); // the six standard cards
    expect(cardPreviews).toHaveLength(6); // the homepage gallery never lists premium cards
    expect(premiumTemplates["lumis-wish-cinema"].occasion).toBe("Any occasion");
    expect(Object.values(premiumTemplates["lumis-wish-cinema"]).join(" ")).not.toMatch(/christmas|snow|new year/i);
  });
  it("only the cinematic card can carry a photo", () => {
    expect([...MEDIA_TEMPLATE_KEYS]).toEqual(["lumis-wish-cinema"]);
    expect(templateAllowsMedia("lumis-wish-cinema")).toBe(true);
    for (const k of [...TEMPLATE_KEYS, "lumis-wish"]) expect(templateAllowsMedia(k)).toBe(false);
  });
  it("three.js is imported only by the homepage Lumi and the cinematic folder, and the cinematic canvas is reachable only through a dynamic import", () => {
    const files = walk(path.join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
    const offenders = files.filter((f) => /from "(three|three\/[a-z/.]+|@react-three\/[a-z-]+)"/.test(readFileSync(f, "utf8")) && !/components\/(lumi|cards\/premium3d)\//.test(f));
    expect(offenders).toEqual([]);
    const importers = files.filter((f) => /["']\.\/CinematicCanvas["']/.test(readFileSync(f, "utf8"))).map((f) => path.relative(root, f));
    expect(importers).toEqual(["src/components/cards/premium3d/CinematicScene.tsx"]);
    expect(read("src/components/cards/premium3d/CinematicScene.tsx")).toMatch(/dynamic\(\(\) => import\("\.\/CinematicCanvas"\), \{ ssr: false \}\)/);
    expect(read("src/components/cards/scenes/index.ts")).toMatch(/"lumis-wish-cinema": dynamic\(\(\) => import\("\.\.\/premium3d\/CinematicScene"\)/);
    // the homepage Lumi implementation is not modified by this feature
    expect(read("src/components/lumi/LumiCanvas.tsx")).not.toMatch(/premium3d/);
  });
});

describe("choreography (pure timeline)", () => {
  const A = 9 / 16;
  it("phases are ordered and the envelope starts in the distance, then arrives in front of the camera", () => {
    const order = [T.arriveEnd, T.flapStart, T.flapEnd, T.slideStart, T.slideEnd, T.turnStart, T.turnEnd, T.openStart, T.openEnd, T.end];
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThanOrEqual(order[i - 1] - 1e-9);
    expect(T.lumiStart).toBeGreaterThan(T.openStart); expect(T.lumiStart).toBeLessThan(T.end); // Lumi pops out as the card finishes opening
    const p0 = poseAt(0, A), pA = poseAt(T.arriveEnd, A);
    expect(p0.envelope.z).toBeLessThan(-30);
    expect(Math.abs(pA.envelope.z)).toBeLessThan(0.01);
    expect(Math.abs(pA.envelope.rx) + Math.abs(pA.envelope.ry) + Math.abs(pA.envelope.rz)).toBeLessThan(0.05); // settles flat to the camera
  });
  it("travels toward the camera monotonically and slows to a stop (no snap at arrival)", () => {
    let prev = poseAt(0, A).envelope.z, maxStep = 0, lastStep = 0;
    for (let t = 0.05; t <= T.arriveEnd; t += 0.05) { const z = poseAt(t, A).envelope.z; expect(z).toBeGreaterThanOrEqual(prev - 1e-9); maxStep = Math.max(maxStep, z - prev); lastStep = z - prev; prev = z; }
    expect(lastStep).toBeLessThan(maxStep * 0.1);
  });
  it("the flap opens fully before the card moves, the card slides out only after the flap is open", () => {
    expect(poseAt(T.flapStart - 0.01, A).flap).toBe(0);
    expect(poseAt(T.flapEnd, A).flap).toBeGreaterThan(2.9);
    expect(poseAt(T.slideStart, A).card.y - poseAt(T.slideStart, A).envelope.y).toBeLessThan(0.1);
    expect(poseAt(T.slideEnd, A).card.y - poseAt(T.slideEnd, A).envelope.y).toBeGreaterThan(DIM.envH * 0.9);
  });
  it("the card never clips the envelope: no yaw or tilt while it is inside the pocket, and it clears the pocket before it turns", () => {
    for (let t = T.slideStart; t <= T.slideEnd - 0.2; t += 0.05) {
      const p = poseAt(t, A);
      expect(Math.abs(p.card.ry - p.envelope.ry)).toBeLessThan(1e-6);
      expect(Math.abs(p.card.rx - p.envelope.rx)).toBeLessThan(1e-6);
    }
    const end = poseAt(T.slideEnd, A);
    expect(end.card.y - DIM.cardH / 2).toBeGreaterThan(end.envelope.y + DIM.envH / 2 - 0.05); // the card's bottom edge is above the envelope's top edge
  });
  it("the card keeps the envelope's z offset while inside (it rides in the pocket) and follows its orientation during arrival", () => {
    const p = poseAt(1.2, A);
    const off = rotateXYZ({ x: 0, y: 0, z: 0.03 }, p.envelope.rx, p.envelope.ry, p.envelope.rz);
    expect(p.card.x).toBeCloseTo(p.envelope.x + off.x, 6);
    expect(p.card.z).toBeCloseTo(p.envelope.z + off.z, 6);
    expect([p.card.rx, p.card.ry, p.card.rz]).toEqual([p.envelope.rx, p.envelope.ry, p.envelope.rz]);
  });
  it("the cover swings from closed to fully open (-PI) and ends face-on to the camera", () => {
    expect(poseAt(T.openStart - 0.01, A).cover).toBeCloseTo(0, 9);
    expect(poseAt(T.end, A).cover).toBeCloseTo(-Math.PI, 5);
    const e = poseAt(T.end, A);
    for (const v of [e.card.rx, e.card.ry, e.card.rz]) expect(v).toBeCloseTo(0, 5);
    expect(e.card.z).toBeCloseTo(READ.z, 5);
    expect(e.card.y).toBeCloseTo(READ.pageY, 5);
  });
  it("the storm calms as the envelope opens, and Lumi appears only after the card is open", () => {
    expect(poseAt(2, A).wind).toBeGreaterThan(poseAt(T.flapEnd + 0.5, A).wind);
    expect(poseAt(T.lumiStart - 0.01, A).lumi).toBe(0);
    expect(poseAt(T.end, A).lumi).toBeGreaterThan(0.95);
    expect(poseAt(T.lumiStart, A).lumi).toBeLessThanOrEqual(poseAt(T.end, A).lumi + 0.5);
  });
  it("is deterministic and total: every time and aspect gives finite numbers (seeking and replay are safe)", () => {
    for (const a of [0.46, 0.56, 1, 1.78, 2.4]) for (let t = -1; t < T.end + 40; t += 0.37) {
      const p = poseAt(t, a);
      for (const v of [p.envelope.x, p.envelope.y, p.envelope.z, p.card.x, p.card.y, p.card.z, p.cover, p.flap, p.glow, p.lumi, p.camera.pos.x, p.camera.pos.y, p.camera.pos.z, p.camera.look.y]) expect(Number.isFinite(v)).toBe(true);
    }
    expect(JSON.stringify(poseAt(7.3, A))).toBe(JSON.stringify(poseAt(7.3, A)));
    expect(easeInOutCubic(0)).toBe(0); expect(easeInOutCubic(1)).toBe(1);
  });
  it("camera framing fits the envelope, and the opened card, on phones and desktops", () => {
    const tan = Math.tan((FOV * Math.PI) / 360);
    for (const a of [0.46, 0.56, 0.75, 1, 1.78]) {
      const p = poseAt(T.arriveEnd, a);
      const dist = p.camera.pos.z - p.camera.look.z;
      expect((DIM.envW / 2) / (dist * tan * a)).toBeLessThan(0.95); // envelope width fits inside the frame
      const r = readingCamera(a);
      expect(DIM.cardW / 2 / (r.dist * tan * a)).toBeLessThan(0.97); // card width fits inside the frame
    }
    expect(fitDistance(3, 2, 0.5)).toBeGreaterThan(fitDistance(3, 2, 2));
  });
  it("the message page rectangle stays inside the viewport and large enough to read on a phone", () => {
    for (const a of [0.46, 0.56, 0.75, 1, 1.78]) {
      const r = pageRect(a);
      expect(r.left).toBeGreaterThanOrEqual(0); expect(r.left + r.width).toBeLessThanOrEqual(1);
      expect(r.top).toBeGreaterThanOrEqual(0); expect(r.top + r.height).toBeLessThanOrEqual(0.96); // leaves room under the card for the Continue button
    }
    const phone = pageRect(390 / 844);
    expect(phone.width * 390).toBeGreaterThan(330); // page is at least 330 px wide on a 390 px phone
    expect(phone.height * 844).toBeGreaterThan(260);
  });
});

describe("particles: configurable and capped on mobile", () => {
  it("winter is the default; another preset can replace it without touching the scene", () => {
    expect(DEFAULT_AMBIENT).toBe("winter");
    expect(presetById("stardust").id).toBe("stardust");
    expect(presetById("nonsense").id).toBe("winter");
    expect(Object.keys(AMBIENT).length).toBeGreaterThanOrEqual(2);
  });
  it("snow falls at several depths (far, mid, near) plus golden dust, and phones get a smaller budget", () => {
    const w = AMBIENT.winter;
    expect(w.layers.filter((l) => !l.glow).length).toBeGreaterThanOrEqual(3);
    expect(w.layers.filter((l) => l.glow).length).toBeGreaterThanOrEqual(1);
    const depths = w.layers.filter((l) => !l.glow).map((l) => l.box.near).sort((a, b) => a - b);
    expect(new Set(depths).size).toBe(depths.length);
    expect(totalParticles(w, true)).toBeLessThan(totalParticles(w, false) * 0.65);
    expect(totalParticles(w, true)).toBeLessThanOrEqual(900);
    expect(totalParticles(w, false)).toBeLessThanOrEqual(2000);
    for (const l of w.layers) expect(layerCount(l, true, w)).toBeGreaterThanOrEqual(8);
  });
});

describe("media frame", () => {
  it("preserves the photo's aspect ratio inside the frame box (landscape, portrait, square, extreme)", () => {
    for (const [w, h] of [[1280, 720], [720, 1280], [800, 800], [4000, 400], [400, 4000]] as const) {
      const f = fitAspect(w, h);
      expect(f.w / f.h).toBeCloseTo(w / h, 5);
      expect(f.w).toBeLessThanOrEqual(FRAME_MAX.w + 1e-9);
      expect(f.h).toBeLessThanOrEqual(FRAME_MAX.h + 1e-9);
    }
  });
});

describe("renderer choice, reduced motion and WebGL fallback", () => {
  it("falls back to the 2D scene without WebGL, after a lost context or a render failure", () => {
    expect(chooseRenderer({ webgl: false, reducedMotion: false })).toBe("fallback-2d");
    expect(chooseRenderer({ webgl: true, reducedMotion: false, contextLost: true })).toBe("fallback-2d");
    expect(chooseRenderer({ webgl: true, reducedMotion: false, failed: true })).toBe("fallback-2d");
    expect(chooseRenderer({ webgl: true, reducedMotion: false })).toBe("webgl");
  });
  it("reduced motion shows the finished card as one still frame (no choreography)", () => {
    expect(chooseRenderer({ webgl: true, reducedMotion: true })).toBe("webgl-static");
    expect(chooseRenderer({ webgl: false, reducedMotion: true })).toBe("fallback-2d");
  });
  it("short messages continue on their own after a reading time; long ones wait for the recipient", () => {
    expect(autoAdvanceSeconds("Happy birthday!")).toBeGreaterThanOrEqual(12);
    expect(autoAdvanceSeconds("x".repeat(140))).toBeLessThan(25);
    expect(autoAdvanceSeconds("x".repeat(141))).toBeNull();
    expect(autoAdvanceSeconds("x".repeat(500))).toBeNull();
  });
  it("the cinematic scene is never time-boxed: the reading stage has no end time in the timeline", () => {
    const src = read("src/components/cards/premium3d/CinematicScene.tsx");
    expect(src).toContain("Continue");
    expect(src).toContain("autoCancelled"); // scrolling the message or pressing Read again cancels the automatic move on
    expect(src).toMatch(/autoAdvanceSeconds\(message\)/);
  });
  it("CSS: the page, the ending and the shimmer have reduced-motion rules", () => {
    const css = read("src/app/globals.css");
    const block = css.slice(css.indexOf("Lumi's Wish: Cinematic (3D)"));
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.cin-page[\s\S]*transition: none/);
    expect(block).toMatch(/\.cin-wordmark[\s\S]*animation: none/);
  });
});

describe("server render (works without JavaScript and WebGL)", () => {
  const props = { recipientName: "Nadia <b>", senderName: "Sam", message: "Hello <img src=x onerror=alert(1)>\nLine two", replayKey: 0, greeting: "Lumi made a wish for you" };
  const html = renderToStaticMarkup(<CinematicScene {...props} />);
  it("renders the personalised greeting as real, escaped text on first paint", () => {
    expect(html).toContain("Nadia &lt;b&gt;");
    expect(html).toContain("Hello &lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("With love, Sam");
    expect(html).toContain("Lumi made a wish for you");
    expect(html).not.toContain("<img src=x");
  });
  it("includes the Mawica ending content, hidden until the end, with the exact copy and no automatic redirect", () => {
    expect(html).toContain("mawica.");
    expect(html).toContain("www.mawica.com");
    expect(html).toContain("Send your feelings to others.");
    expect(html).toContain("BRING YOUR WISHES TO LIFE.");
    expect(html).toContain("Create your own card");
    expect(html).toContain('href="/create"');
    expect(html).not.toMatch(/http-equiv="refresh"|location\.(href|replace)|router\.(push|replace)/);
    expect(read("src/components/cards/premium3d/CinematicScene.tsx")).not.toMatch(/router\.(push|replace)|location\.(href|assign|replace)\s*=/);
  });
  it("the Create CTA lives in the ending layer, which is a separate sibling of the message page (never over the message)", () => {
    const pageAt = html.indexOf('class="cin-page'), endAt = html.indexOf('class="cin-end');
    expect(pageAt).toBeGreaterThan(-1);
    expect(endAt).toBeGreaterThan(pageAt);
    const messageSection = html.slice(pageAt, endAt);
    expect(messageSection).not.toContain("Create your own card");
    expect(html.slice(endAt)).toContain("Create your own card");
    expect(html).toMatch(/class="cin-end[^"]*"[^>]*aria-hidden="true"/); // hidden from assistive tech until it is shown
  });
  it("shows no wallet, account or credit information", () => {
    expect(html).not.toMatch(/credit|wallet|premium|owner|tier|userId|email/i);
  });
});
