import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FinalCta } from "@/components/landing/FinalCta";
import { finalCtaArt, finalCtaCopy } from "@/content/finalCta";

const root = process.cwd();

describe("emotional family FinalCta", () => {
  it("ships optimised desktop and mobile background assets", () => {
    expect(existsSync(path.join(root, `public${finalCtaArt.desktop.src}`))).toBe(true);
    expect(existsSync(path.join(root, `public${finalCtaArt.mobile.src}`))).toBe(true);
  });

  it("renders approved copy and create CTA destination", () => {
    const html = renderToStaticMarkup(<FinalCta />);
    expect(html).toContain(finalCtaCopy.eyebrow);
    expect(html).toContain("A Little Wish.");
    expect(html).toContain("A Lifetime of Love.");
    expect(html).toContain(finalCtaCopy.body);
    expect(html).toContain(finalCtaCopy.note);
    expect(html).toContain('href="/create"');
    expect(html).toContain(finalCtaCopy.cta);
    expect(html).not.toContain("Bring your wishes to life");
  });

  it("homepage still mounts FinalCta after the other sections", () => {
    const page = readFileSync(path.join(root, "src/app/(site)/page.tsx"), "utf8");
    expect(page).toMatch(/HowItWorks[\s\S]*FinalCta/);
    expect(page).toContain("<FinalCta />");
  });
});
