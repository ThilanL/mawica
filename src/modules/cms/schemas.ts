import { z } from "zod";

/** Reject angle brackets — CMS stores plain text only (no HTML/scripts). */
function plainString(max: number, min = 1) {
  return z
    .string()
    .min(min)
    .max(max)
    .refine((s) => !/[<>]/.test(s), { message: "HTML tags are not allowed" });
}

const safeHref = z
  .string()
  .min(1)
  .max(300)
  .refine(
    (h) =>
      h.startsWith("/") ||
      h.startsWith("#") ||
      /^https:\/\/([a-z0-9.-]+\.)?mawica\.com(\/.*)?$/i.test(h),
    { message: "Href must be a relative path or https mawica.com URL" },
  )
  .refine((h) => !/[<>"']/.test(h), { message: "Unsafe characters in href" });

/** UUID or null — marketing asset references only (never CardMedia ids). */
const assetId = z.union([z.string().uuid(), z.null()]);

/** ISO-8601 datetime with offset, e.g. 2026-12-01T00:00:00+11:00 */
const isoOffsetDateTime = z
  .string()
  .min(20)
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid datetime" })
  .refine((s) => /([zZ]|[+-]\d{2}:?\d{2})$/.test(s), {
    message: "Datetime must include a timezone offset",
  });

export const heroPayloadSchema = z.object({
  eyebrow: plainString(120),
  titleLines: z.tuple([plainString(120), plainString(120)]),
  body: plainString(800),
  cta: plainString(80),
  annotation: z.tuple([plainString(80), plainString(80), plainString(80)]),
  benefits: z
    .array(z.object({ id: z.enum(["heart", "sparkles", "share"]), label: plainString(80) }))
    .length(3),
});

export const homeSectionsPayloadSchema = z.object({
  galleryEyebrow: plainString(80),
  galleryTitle: plainString(160),
  galleryBody: plainString(800),
  galleryChristmasHeading: plainString(120),
  galleryNewYearHeading: plainString(120),
  howItWorksEyebrow: plainString(80),
  howItWorksTitle: plainString(160),
  howItWorksBody: plainString(800),
  steps: z
    .array(z.object({ n: plainString(8), title: plainString(80), body: plainString(400) }))
    .length(3),
  meetLumiEyebrow: plainString(80),
  meetLumiTitle: plainString(160),
  meetLumiBody: plainString(800),
  benefitsEyebrow: plainString(80),
  benefitsTitle: plainString(160),
  benefits: z
    .array(z.object({ title: plainString(80), body: plainString(400) }))
    .length(4),
  finalCtaTitle: plainString(160),
  finalCtaBody: plainString(800),
  finalCtaLabel: plainString(80),
  recipientEyebrow: plainString(80),
  recipientTitle: plainString(160),
  recipientBody: plainString(800),
});

export const navPayloadSchema = z.object({
  links: z.array(z.object({ label: plainString(80), href: safeHref })).min(1).max(12),
  createCta: plainString(80),
  searchAriaLabel: plainString(120),
  searchHref: safeHref,
});

export const footerPayloadSchema = z.object({
  tagline: plainString(500),
  copyright: plainString(160),
  domainLabel: plainString(80),
  columns: z
    .array(
      z.object({
        title: plainString(80),
        links: z.array(z.object({ label: plainString(80), href: safeHref })).min(1).max(10),
      }),
    )
    .min(1)
    .max(6),
});

export const legalPayloadSchema = z.object({
  title: plainString(160),
  updated: plainString(120),
  showDraftBanner: z.boolean(),
  sections: z
    .array(
      z.object({
        heading: plainString(160),
        paragraphs: z.array(plainString(4000)).min(1).max(30),
      }),
    )
    .min(1)
    .max(40),
});

export const seoPayloadSchema = z.object({
  titleDefault: plainString(160),
  description: plainString(320),
  ogTitle: plainString(160),
  ogDescription: plainString(320),
  twitterTitle: plainString(160),
  twitterDescription: plainString(320),
});

/** Seasonal campaign (Christmas / New Year) — uses existing homepage anchors. */
export const campaignPayloadSchema = z
  .object({
    season: z.enum(["christmas", "new-year"]),
    /** Existing homepage section id: christmas | new-year */
    anchorId: z.enum(["christmas", "new-year"]),
    title: plainString(160),
    description: plainString(800),
    ctaLabel: plainString(80),
    ctaHref: safeHref,
    mediaAssetId: assetId,
    sectionVisible: z.boolean(),
    startsAt: isoOffsetDateTime,
    endsAt: isoOffsetDateTime,
  })
  .refine((c) => Date.parse(c.endsAt) > Date.parse(c.startsAt), {
    message: "endsAt must be after startsAt",
  })
  .refine((c) => (c.season === "christmas" ? c.anchorId === "christmas" : c.anchorId === "new-year"), {
    message: "anchorId must match season",
  });

export const CMS_DOCUMENT_KEYS = [
  "home.hero",
  "home.sections",
  "site.nav",
  "site.footer",
  "legal.privacy",
  "legal.terms",
  "seo.site",
  "campaign.christmas",
  "campaign.newyear",
] as const;

export type CmsDocumentKey = (typeof CMS_DOCUMENT_KEYS)[number];

export const documentSchemas = {
  "home.hero": heroPayloadSchema,
  "home.sections": homeSectionsPayloadSchema,
  "site.nav": navPayloadSchema,
  "site.footer": footerPayloadSchema,
  "legal.privacy": legalPayloadSchema,
  "legal.terms": legalPayloadSchema,
  "seo.site": seoPayloadSchema,
  "campaign.christmas": campaignPayloadSchema,
  "campaign.newyear": campaignPayloadSchema,
} as const;

export type HeroPayload = z.infer<typeof heroPayloadSchema>;
export type HomeSectionsPayload = z.infer<typeof homeSectionsPayloadSchema>;
export type NavPayload = z.infer<typeof navPayloadSchema>;
export type FooterPayload = z.infer<typeof footerPayloadSchema>;
export type LegalPayload = z.infer<typeof legalPayloadSchema>;
export type SeoPayload = z.infer<typeof seoPayloadSchema>;
export type CampaignPayload = z.infer<typeof campaignPayloadSchema>;

export function parseDocumentPayload(key: CmsDocumentKey, raw: unknown) {
  return documentSchemas[key].parse(raw);
}

export function isCmsDocumentKey(k: string): k is CmsDocumentKey {
  return (CMS_DOCUMENT_KEYS as readonly string[]).includes(k);
}

export function isCampaignDocumentKey(k: string): k is "campaign.christmas" | "campaign.newyear" {
  return k === "campaign.christmas" || k === "campaign.newyear";
}

/** Escape for safe HTML text nodes (SEO / legal rendering). */
export function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Whether a campaign should display for visitors right now. */
export function isCampaignActiveNow(payload: CampaignPayload, now = new Date()): boolean {
  if (!payload.sectionVisible) return false;
  const t = now.getTime();
  return t >= Date.parse(payload.startsAt) && t < Date.parse(payload.endsAt);
}
