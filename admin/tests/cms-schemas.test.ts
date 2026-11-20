import { describe, expect, it } from "vitest";
import {
  defaultPayloadFor,
  escapeText,
  parseDocumentPayload,
  type CmsDocumentKey,
  CMS_DOCUMENT_KEYS,
} from "@mawica/modules/cms";

describe("CMS schemas & defaults", () => {
  it("validates every default payload", () => {
    for (const key of CMS_DOCUMENT_KEYS) {
      expect(() => parseDocumentPayload(key, defaultPayloadFor(key))).not.toThrow();
    }
  });

  it("rejects HTML / script injection in plain fields", () => {
    const hero = defaultPayloadFor("home.hero") as Record<string, unknown>;
    expect(() =>
      parseDocumentPayload("home.hero", { ...hero, eyebrow: "<script>alert(1)</script>" }),
    ).toThrow(/HTML/);
  });

  it("rejects unsafe hrefs", () => {
    const nav = defaultPayloadFor("site.nav") as {
      links: Array<{ label: string; href: string }>;
      createCta: string;
      searchAriaLabel: string;
      searchHref: string;
    };
    expect(() =>
      parseDocumentPayload("site.nav", {
        ...nav,
        links: [{ label: "Evil", href: "javascript:alert(1)" }],
      }),
    ).toThrow();
    expect(() =>
      parseDocumentPayload("site.nav", {
        ...nav,
        links: [{ label: "Evil", href: "https://evil.example" }],
      }),
    ).toThrow();
    expect(() =>
      parseDocumentPayload("site.nav", {
        ...nav,
        links: [{ label: "Ok", href: "/#christmas" }],
      }),
    ).not.toThrow();
    expect(() =>
      parseDocumentPayload("site.nav", {
        ...nav,
        links: [{ label: "Ok", href: "https://mawica.com/create" }],
      }),
    ).not.toThrow();
  });

  it("escapes SEO / text nodes", () => {
    expect(escapeText(`A <b>"quote"</b> & 'x'`)).toBe(
      "A &lt;b&gt;&quot;quote&quot;&lt;/b&gt; &amp; &#39;x&#39;",
    );
  });

  it("covers expected document keys for P5B + P5C campaigns", () => {
    const expected: CmsDocumentKey[] = [
      "home.hero",
      "home.sections",
      "site.nav",
      "site.footer",
      "legal.privacy",
      "legal.terms",
      "seo.site",
      "campaign.christmas",
      "campaign.newyear",
    ];
    expect([...CMS_DOCUMENT_KEYS]).toEqual(expected);
  });

  it("validates campaign schedule and anchors", () => {
    const base = defaultPayloadFor("campaign.christmas") as Record<string, unknown>;
    expect(() =>
      parseDocumentPayload("campaign.christmas", {
        ...base,
        endsAt: "2026-10-01T00:00:00+11:00",
        startsAt: "2026-11-01T00:00:00+11:00",
      }),
    ).toThrow(/endsAt/);
    expect(() =>
      parseDocumentPayload("campaign.christmas", { ...base, anchorId: "new-year" }),
    ).toThrow(/anchorId/);
    expect(() =>
      parseDocumentPayload("campaign.christmas", { ...base, startsAt: "2026-11-01T00:00:00" }),
    ).toThrow(/timezone/);
  });
});
