import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Hero } from "@/components/landing/Hero";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { heroArtwork, heroCopy, heroPlates } from "@/content/hero";
import { defaultHero, defaultNav } from "@/modules/cms/defaults";

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("premium Christmas hero assets", () => {
  it("ships layered background and transparent globe webps (not a single composite screenshot)", () => {
    expect(existsSync(path.join(root, "public/art/hero/christmas-bg-desktop.webp"))).toBe(true);
    expect(existsSync(path.join(root, "public/art/hero/christmas-bg-mobile.webp"))).toBe(true);
    expect(existsSync(path.join(root, "public/art/hero/snow-globe-mawica.webp"))).toBe(true);
    expect(existsSync(path.join(root, "public/art/hero/snow-globe-mawica-sm.webp"))).toBe(true);
    expect(heroPlates.desktop?.src).toBe("/art/hero/christmas-bg-desktop.webp");
    expect(heroArtwork.src).toBe("/art/hero/snow-globe-mawica.webp");
    expect(heroArtwork.crop).toEqual({ top: 0, bottom: 0 });
  });

  it("keeps the catalogue snow-globe artwork separate from the homepage Mawica globe", () => {
    expect(existsSync(path.join(root, "public/art/hero/globe@2x.webp"))).toBe(true);
    expect(heroArtwork.src).not.toContain("globe@2x");
  });
});

describe("hero copy and chrome", () => {
  it("renders the approved eyebrow, headline, CTA destination and benefits", () => {
    const html = renderToStaticMarkup(<Hero copy={defaultHero()} />);
    expect(html).toContain(heroCopy.eyebrow);
    expect(html).toContain("A Little Magic.");
    expect(html).toContain("A Lot of Love.");
    expect(html).toContain(heroCopy.body);
    expect(html).toContain('href="/create"');
    expect(html).toContain(heroCopy.cta);
    for (const b of heroCopy.benefits) expect(html).toContain(b.label);
    expect(html).toMatch(/snow-globe-mawica/);
    expect(html).toMatch(/christmas-bg/);
  });

  it("header keeps official logo, centred nav links, sign-in and create CTA", () => {
    const html = renderToStaticMarkup(<SiteHeader nav={defaultNav()} />);
    expect(html).toContain('aria-label="mawica. home"');
    expect(html).toContain("Christmas Cards");
    expect(html).toContain("New Year Cards");
    expect(html).toContain("How It Works");
    expect(html).toContain("About");
    expect(html).toContain("Create Free Card");
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain("Browse Christmas cards");
    expect(read("src/components/layout/SiteHeader.tsx")).toContain("Logo");
  });
});
