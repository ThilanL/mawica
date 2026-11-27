import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Hero } from "@/components/landing/Hero";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { celebrations } from "@/content/celebrations";
import { heroArtwork, heroCopy, heroPlates } from "@/content/hero";

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("cinematic celebration hero assets", () => {
  it("ships christmas, birthday, and wedding videos with posters", () => {
    for (const c of celebrations) {
      expect(existsSync(path.join(root, `public${c.video}`))).toBe(true);
      expect(existsSync(path.join(root, `public${c.poster}`))).toBe(true);
    }
    expect(celebrations.map((c) => c.id)).toEqual(["christmas", "birthday", "wedding"]);
  });

  it("keeps layered Christmas fallbacks and catalogue globe separate", () => {
    expect(existsSync(path.join(root, "public/art/hero/christmas-bg-desktop.webp"))).toBe(true);
    expect(existsSync(path.join(root, "public/art/hero/christmas-bg-mobile.webp"))).toBe(true);
    expect(existsSync(path.join(root, "public/art/hero/snow-globe-mawica.webp"))).toBe(true);
    expect(existsSync(path.join(root, "public/art/hero/snow-globe-mawica-sm.webp"))).toBe(true);
    expect(existsSync(path.join(root, "public/art/hero/globe@2x.webp"))).toBe(true);
    expect(heroPlates.desktop?.src).toBe("/art/hero/christmas-bg-desktop.webp");
    expect(heroArtwork.src).toBe("/art/hero/snow-globe-mawica.webp");
    expect(heroArtwork.src).not.toContain("globe@2x");
    expect(heroArtwork.crop).toEqual({ top: 0, bottom: 0 });
  });
});

describe("hero copy and chrome", () => {
  it("renders Christmas first-paint copy, CTA destination and celebration nav", () => {
    const html = renderToStaticMarkup(<Hero />);
    expect(html).toContain(celebrations[0].eyebrow);
    expect(html).toContain("A Little Magic.");
    expect(html).toContain("A Lot of Love.");
    expect(html).toContain(celebrations[0].body);
    expect(html).toContain('href="/create"');
    expect(html).toContain(heroCopy.cta);
    expect(html).not.toContain("Free to create");
    expect(html).not.toContain("Beautiful 3D cards");
    expect(html).not.toContain("Share instantly");
    expect(html).toContain("Christmas");
    expect(html).toContain("Birthday");
    expect(html).toContain("Wedding");
    expect(html).toMatch(/christmas\.mp4|christmas-poster/);
    expect(celebrations).toHaveLength(3);
  });

  it("uses a mobile-safe stacked hero with contain video framing", () => {
    const src = read("src/components/landing/cinematic/CinematicHero.tsx");
    const video = read("src/components/landing/cinematic/HeroVideoLayer.tsx");
    expect(src).toMatch(/aspect-\[16\/9\]/);
    expect(src).toMatch(/order-1/);
    expect(src).toMatch(/order-2/);
    expect(src).toMatch(/order-3/);
    expect(src).toMatch(/order-4/);
    expect(src).not.toMatch(/max-md:object-\[78%/);
    expect(video).toMatch(/object-contain/);
    expect(video).toMatch(/md:object-cover/);
    expect(read("src/components/landing/cinematic/HeroContent.tsx")).toMatch(
      /clamp\(2\.35rem,\s*8\.2vw,\s*3\.25rem\)/,
    );
  });

  it("defers hero MP4 network so mobile first paint is poster-first", () => {
    const src = read("src/components/landing/cinematic/CinematicHero.tsx");
    const video = read("src/components/landing/cinematic/HeroVideoLayer.tsx");
    expect(src).toMatch(/mediaEnabled/);
    expect(src).toMatch(/max-width:\s*767px/);
    expect(src).toMatch(/saveData|effectiveType/);
    expect(video).toMatch(/preload=\{load \? "metadata" : "none"\}/);
    expect(video).not.toMatch(/preload=["']auto["']/);
    expect(video).toMatch(/fetchPriority=\{active \? "high" : "low"\}/);
  });

  it("applies a continuous gradient to the semantic H1 and freezes it under reduced motion", () => {
    const html = renderToStaticMarkup(<Hero />);
    expect(html).toMatch(/<h1[^>]*class="[^"]*hero-gradient-text[^"]*"[^>]*id="hero-title"/);
    expect(html).toContain("A Little Magic.");
    expect(html).toContain("A Lot of Love.");
    const css = read("src/app/globals.css");
    expect(css).toMatch(/\.hero-gradient-text[\s\S]*background-clip:\s*text/);
    expect(css).toMatch(/hero-gradient-sweep\s+10s/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.hero-gradient-text[\s\S]*animation:\s*none/);
    expect(read("src/components/landing/GradientText.tsx")).not.toMatch(/gsap|framer-motion|@react-bits/);
  });

  it("celebration config matches approved copy and cycle order", () => {
    expect(celebrations[0]).toMatchObject({
      id: "christmas",
      eyebrow: "Christmas Magic 2026",
      cta: "Create Your Free Card",
    });
    expect(celebrations[1].titleLines).toEqual(["Make Every Birthday", "Unforgettable."]);
    expect(celebrations[2].titleLines).toEqual(["Every Love\u00A0Story", "Deserves Magic."]);
    expect(celebrations).toHaveLength(3);
  });

  it("header keeps official logo, centred nav links, sign-in and create CTA", () => {
    const html = renderToStaticMarkup(<SiteHeader />);
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
