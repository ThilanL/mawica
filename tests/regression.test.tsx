import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { scenes } from "@/components/cards/scenes";
import { TEMPLATE_KEYS, templates } from "@/modules/templates/registry";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

const root = path.resolve(__dirname, "..");
const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("reduced-motion regression (CSS contract)", () => {
  const reducedBlocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
  const animated = [...css.matchAll(/^\.((?:cc|sg)-[a-z0-9-]+)\s*\{[^}]*animation:/gm)].map((m) => m[1]);

  it("finds the animated card classes", () => {
    expect(animated.length).toBeGreaterThan(15);
  });
  it("every animated cc-/sg- class is disabled (or hidden) under prefers-reduced-motion", () => {
    for (const cls of animated) {
      expect(reducedBlocks, `.${cls} must be handled in a reduced-motion block`).toContain(`.${cls}`);
    }
  });
  it("entrance keyframes only define a 'from' frame, so removing the animation lands on the final state", () => {
    for (const name of ["up", "pop", "fade", "lit", "glow", "draw", "lid", "rays", "clink-l", "clink-r"]) {
      const m = css.match(new RegExp(`@keyframes cc-${name} \\{([^@]*?)\\}\\s*(?=\\n@|\\n\\n|\\n\\.)`));
      expect(m, `keyframes cc-${name}`).toBeTruthy();
      expect(m![1]).toMatch(/^\s*from\s*\{/);
      expect(m![1]).not.toMatch(/\bto\s*\{|\d+%\s*\{/);
    }
  });
  it("any element using the countdown/hidden-by-default slot animation is also removed under reduced motion", () => {
    const src = read("src/components/cards/scenes/NewYear2027Scene.tsx");
    expect(src).toMatch(/cc-slot cc-only-motion/);
    expect(reducedBlocks).toContain(".cc-only-motion");
  });
  it("scene code gates JS-driven motion on the reduced-motion hook", () => {
    expect(read("src/components/cards/parts/useSchedule.ts")).toContain("usePrefersReducedMotion");
    expect(read("src/components/cards/parts/ParticleBurst.tsx")).toContain("reduced");
    expect(read("src/components/landing/SnowCanvas.tsx")).toContain("reduced");
  });
});

describe("recipient scenes render readable, personalised, safe content on the server", () => {
  const props = { recipientName: "Ava <b>", senderName: "Sam", message: "Hello <img src=x onerror=alert(1)>\nLine two", replayKey: 0 };
  for (const key of TEMPLATE_KEYS) {
    it(`${key}: name, message, sender and greeting are in the first HTML; nothing is pre-hidden or unescaped`, () => {
      const Scene = scenes[key];
      const html = renderToStaticMarkup(<Scene {...props} greeting={templates[key].greeting} />);
      expect(html).toContain('aria-label="Your greeting"');
      expect(html).toContain("Ava &lt;b&gt;");
      expect(html).toContain("Hello &lt;img src=x onerror=alert(1)&gt;");
      expect(html).toContain("Sam");
      expect(html).toContain(templates[key].greeting);
      expect(html).not.toContain("<img src=x");
      expect(html).not.toMatch(/style="[^"]*opacity:\s*0/); // never hidden inline; motion only runs via CSS "from" frames
      expect(html).not.toMatch(/display:\s*none/);
    });
  }
});

describe("indexing policy and public metadata", () => {
  it("robots.txt blocks cards and API, and points to the sitemap", () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule.disallow).toEqual(expect.arrayContaining(["/c/", "/api/"]));
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/);
  });
  it("sitemap lists public pages only, never cards or the API", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => /\/privacy$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/terms$/.test(u))).toBe(true);
    expect(urls.some((u) => u.includes("/c/") || u.includes("/api"))).toBe(false);
  });
  it("card pages are noindex/nofollow with generic, non-personal metadata", () => {
    const layout = read("src/app/(card)/layout.tsx");
    expect(layout).toContain("index: false");
    expect(layout).toContain("follow: false");
    expect(read("src/app/(card)/opengraph-image.tsx")).not.toMatch(/recipient|sender|message/i);
    expect(read("src/lib/og.tsx")).not.toMatch(/recipientName|senderName|message/);
  });
  it("legal pages are visibly marked as drafts for owner review", () => {
    expect(read("src/components/ui/LegalPage.tsx")).toContain("Draft for owner and legal review");
    expect(read("src/app/(site)/privacy/page.tsx")).toContain("<LegalPage");
    expect(read("src/app/(site)/terms/page.tsx")).toContain("<LegalPage");
  });
  it("artwork stays flagged temporary until production art is supplied", () => {
    const art = read("src/content/artwork.ts");
    expect(art.match(/\{ status: "placeholder" \}/g)?.length).toBe(6);
  });
});
