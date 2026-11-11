import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LumisWishScene } from "@/components/cards/scenes/LumisWishScene";
import { premiumScenes, scenes } from "@/components/cards/scenes";
import { createCardSchema } from "@/modules/cards/schema";
import { cardPreviews } from "@/content/site";
import { ALL_TEMPLATE_KEYS, PREMIUM_TEMPLATE_KEYS, TEMPLATE_KEYS, getTemplate, isAnyTemplateKey, isPremiumTemplateKey, isTemplateKey, premiumTemplates, templateTier, templates } from "@/modules/templates/registry";

const root = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const css = read("src/app/globals.css");

describe("premium registry: the six launch cards are untouched", () => {
  it("the standard registry, scene map and homepage gallery still contain exactly the six cards", () => {
    expect([...TEMPLATE_KEYS]).toEqual(["snow-globe", "christmas-tree", "special-gift", "warm-wishes", "new-year-2027", "new-year-celebration"]);
    expect(Object.keys(templates)).toHaveLength(6);
    expect(Object.keys(scenes)).toHaveLength(6);
    expect(cardPreviews.map((p) => p.id)).toEqual([...TEMPLATE_KEYS]); // the homepage gallery never lists the premium card
    for (const k of TEMPLATE_KEYS) { expect(templateTier(k)).toBe("STANDARD"); expect(isPremiumTemplateKey(k)).toBe(false); }
  });
  it("Lumi's Wish is a separate PREMIUM template, resolved only on the server registry", () => {
    expect([...PREMIUM_TEMPLATE_KEYS]).toEqual(["lumis-wish", "lumis-wish-cinema"]);
    expect([...ALL_TEMPLATE_KEYS]).toEqual([...TEMPLATE_KEYS, "lumis-wish", "lumis-wish-cinema"]);
    expect(templateTier("lumis-wish")).toBe("PREMIUM");
    expect(isTemplateKey("lumis-wish")).toBe(false); // standard-only helpers do not see it
    expect(isAnyTemplateKey("lumis-wish")).toBe(true);
    expect(getTemplate("lumis-wish")).toBe(premiumTemplates["lumis-wish"]);
    expect(getTemplate("snow-globe")).toBe(templates["snow-globe"]);
    expect(() => templateTier("nope")).toThrow();
  });
  it("is occasion-neutral (no Christmas-only wording) and its default message is valid input", () => {
    const t = premiumTemplates["lumis-wish"];
    expect(t.occasion).toBe("Any occasion");
    expect(`${t.title} ${t.description} ${t.greeting} ${t.defaultMessage}`).not.toMatch(/christmas|santa|snow|new year|xmas/i);
    expect(createCardSchema.safeParse({ templateKey: "lumis-wish", recipientName: "Ava", senderName: "Sam", message: t.defaultMessage }).success).toBe(true);
    expect(createCardSchema.safeParse({ templateKey: "lumis-wish-pro", recipientName: "Ava", senderName: "Sam", message: "x" }).success).toBe(false);
  });
  it("the premium scene is registered in its own lazy map and the six-scene map source is untouched in form", () => {
    expect(Object.keys(premiumScenes)).toEqual(["lumis-wish", "lumis-wish-cinema"]);
    const src = read("src/components/cards/scenes/index.ts");
    for (const k of TEMPLATE_KEYS) expect(src).toContain(`"${k}": dynamic(`);
    expect(src).toContain(`"lumis-wish": dynamic(() => import("./LumisWishScene")`);
  });
});

describe("Lumi's Wish scene", () => {
  const props = { recipientName: "Nadia <b>", senderName: "Sam", message: "Hello <img src=x onerror=alert(1)>\nLine two", replayKey: 0, greeting: premiumTemplates["lumis-wish"].greeting };
  const html = renderToStaticMarkup(<LumisWishScene {...props} />);

  it("server-renders the personalised greeting as real, escaped DOM text (works without JavaScript)", () => {
    expect(html).toContain("Nadia &lt;b&gt;");
    expect(html).toContain("Hello &lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("With love, Sam");
    expect(html).toContain("Lumi made a wish for you");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toMatch(/visibility:\s*hidden|display:\s*none/); // nothing pre-hidden inline
  });
  it("shows no wallet, account or credit information to recipients", () => {
    expect(html).not.toMatch(/credit|wallet|premium|account|sign in|email|@/i);
  });
  it("Lumi is a labelled, keyboard-focusable button; decorative layers are hidden from assistive tech", () => {
    expect(html).toMatch(/<button[^>]*aria-label="Lumi, a golden star\. Tap for more sparkles"/);
    expect(html).toMatch(/lumi-awake\.webp/);
    expect(html).toMatch(/lumi-asleep\.webp/);
    expect(html).toMatch(/alt=""/);
  });
  it("uses no WebGL, Three.js or extra rendering dependency, and no network calls", () => {
    for (const f of ["src/components/cards/scenes/LumisWishScene.tsx", "src/components/cards/parts/ParticleBurst.tsx"]) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""); // code only, not comments
      expect(src, f).not.toMatch(/three|@react-three|webgl|WebGL|fetch\(|localStorage|sessionStorage|navigator\.sendBeacon/);
    }
    const imports = read("src/components/cards/scenes/LumisWishScene.tsx").split("\n").filter((l) => /^import\b/.test(l)).join("\n");
    expect(imports).not.toMatch(/lumi\/|LumiCanvas|better-auth|@\/lib|@\/modules/);
  });
  it("keeps the preview frames small (two WebP stills)", () => {
    for (const f of ["lumi-awake", "lumi-asleep"]) expect(readFileSync(path.join(root, `public/art/lumi/${f}.webp`)).length).toBeLessThan(40 * 1024);
  });
});

describe("Lumi's Wish reduced-motion contract", () => {
  const reducedBlocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
  const animated = [...css.matchAll(/^\.((?:lw)-[a-z0-9-]+)\s*\{[^}]*animation:/gm)].map((m) => m[1]);
  it("finds the animated premium classes", () => expect(animated.length).toBeGreaterThanOrEqual(12));
  it("every animated lw- class is disabled under prefers-reduced-motion", () => {
    for (const cls of animated) expect(reducedBlocks, `.${cls}`).toContain(`.${cls}`);
  });
  it("transient layers (that end hidden or exist only for motion) are removed under reduced motion", () => {
    const src = read("src/components/cards/scenes/LumisWishScene.tsx");
    for (const cls of ["lw-orb", "lw-gather", "lw-asleep", "lw-ripple", "lw-wish-star"]) {
      const i = src.indexOf(cls);
      expect(i, cls).toBeGreaterThan(-1);
      expect(src.slice(Math.max(0, i - 260), i + 120), `${cls} (or its wrapper) carries cc-only-motion`).toContain("cc-only-motion");
    }
    expect(reducedBlocks).toContain(".cc-only-motion");
  });
  it("keyframes for the permanent layers only describe the 'from' frame (finished card without animation)", () => {
    for (const name of ["lw-rise", "lw-wake-in", "lw-halo", "lw-name-in"]) {
      const m = css.match(new RegExp(`@keyframes ${name} \\{([^\\n]*)\\}\\n`));
      expect(m, name).toBeTruthy();
      expect(m![1]).toMatch(/^\s*from\s*\{/);
      expect(m![1]).not.toMatch(/\bto\s*\{|\d+%\s*\{/);
    }
  });
  it("every transient keyframe starts invisible, so its pre-delay (backwards fill) frame never shows early", () => {
    for (const name of ["lw-orb", "lw-gather", "lw-ripple", "lw-wish-star", "lw-wish-word"]) {
      const m = css.match(new RegExp(`@keyframes ${name} \\{ 0% \\{ ([^}]*)\\}`));
      expect(m, name).toBeTruthy();
      expect(m![1], name).toMatch(/opacity:\s*0\b/);
    }
  });
  it("JS-driven particles are gated on the reduced-motion hook", () => {
    expect(read("src/components/cards/parts/useSchedule.ts")).toContain("usePrefersReducedMotion");
    expect(read("src/components/cards/parts/ParticleBurst.tsx")).toContain("reduced");
  });
  it("infinite animations use backwards fill so nothing shows early during their start delay", () => {
    expect(css).toMatch(/\.lw-wish-word \{ animation: lw-wish-word [^;]*infinite backwards/);
  });
});
