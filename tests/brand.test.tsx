import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardEnding } from "@/components/brand/CardEnding";
import { Logo } from "@/components/brand/Logo";
import { Wordmark } from "@/components/brand/Wordmark";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { defaultFooter } from "@/modules/cms/defaults";

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("brand assets", () => {
  it("keeps the official wordmark, mark crop, app icon and generated tab icons on disk", () => {
    for (const f of [
      "public/brand/mawica-wordmark.png",
      "public/brand/mawica-mark.png",
      "public/brand/mawica-app-icon.png",
      "public/brand/mawica-icon-192.png",
      "src/app/favicon.ico",
      "src/app/icon.png",
      "src/app/apple-icon.png",
    ]) {
      expect(existsSync(path.join(root, f)), f).toBe(true);
    }
  });

  it("does not leave a Next.js default-only favicon story: app icons exist beside metadata fallbacks", () => {
    const site = read("src/app/(site)/layout.tsx");
    const card = read("src/app/(card)/layout.tsx");
    expect(site).toMatch(/mawica-icon-192\.png/);
    expect(card).toMatch(/mawica-icon-192\.png/);
    expect(existsSync(path.join(root, "src/app/favicon.ico"))).toBe(true);
  });
});

describe("Wordmark / Logo / CardEnding", () => {
  it("Logo and Wordmark use the official PNG assets, never a restyled font wordmark", () => {
    const logo = renderToStaticMarkup(<Logo />);
    const mark = renderToStaticMarkup(<Wordmark variant="mark" size="ending" surface="dark" />);
    expect(logo).toMatch(/mawica-wordmark\.png/);
    expect(logo).toContain('aria-label="mawica. home"');
    expect(mark).toMatch(/mawica-mark\.png/);
    expect(mark).toContain('alt="mawica."');
  });

  it("CardEnding uses the official mark plus URL, tagline and CTAs — no plain-text mawica. wordmark", () => {
    const html = renderToStaticMarkup(<CardEnding onReadAgain={() => {}} />);
    expect(html).toMatch(/mawica-mark\.png/);
    expect(html).toContain("www.mawica.com");
    expect(html).toContain("Send your feelings to others.");
    expect(html).toContain("BRING YOUR WISHES TO LIFE.");
    expect(html).toContain("Create your own card");
    expect(html).toContain("Read again");
    expect(html).not.toMatch(/<p[^>]*class="[^"]*cin-wordmark/);
  });

  it("footer uses the official gradient wordmark on the dark surface", () => {
    const html = renderToStaticMarkup(<SiteFooter footer={defaultFooter()} />);
    expect(html).toMatch(/mawica-wordmark\.png/);
    expect(html).not.toMatch(/mawica-app-icon\.png/);
  });

  it("card shells import the shared CardEnding instead of inlining plain mawica. text", () => {
    for (const f of [
      "src/components/cards/premium3d/stage/LegacyEnding.tsx",
      "src/components/cards/premium3d/stage/Stage.tsx",
      "src/components/cards/premium3d/CinematicScene.tsx",
    ]) {
      const src = read(f);
      expect(src).toContain("CardEnding");
      expect(src).not.toMatch(/<p className="cin-wordmark">mawica\.<\/p>/);
    }
  });
});
