import "server-only";
import { db } from "@/lib/db";
import { defaultPayloadFor } from "./defaults";
import {
  isCampaignActiveNow,
  isCmsDocumentKey,
  parseDocumentPayload,
  type CampaignPayload,
  type CmsDocumentKey,
  type FooterPayload,
  type HeroPayload,
  type HomeSectionsPayload,
  type LegalPayload,
  type NavPayload,
  type SeoPayload,
} from "./schemas";

export type ResolveSource = "cms" | "fallback";

async function readPublishedPayload(key: CmsDocumentKey): Promise<unknown | null> {
  try {
    const doc = await db.cmsDocument.findUnique({
      where: { key },
      select: {
        publishedRevision: { select: { payload: true } },
      },
    });
    return doc?.publishedRevision?.payload ?? null;
  } catch {
    // Table missing (migration not applied) or DB error → fallback.
    return null;
  }
}

export async function resolveCmsDocument<T>(
  key: CmsDocumentKey,
  parse: (raw: unknown) => T,
): Promise<{ data: T; source: ResolveSource }> {
  const published = await readPublishedPayload(key);
  if (published != null) {
    try {
      return { data: parse(published), source: "cms" };
    } catch {
      // Corrupt published payload — fail closed to static defaults.
    }
  }
  return { data: parse(defaultPayloadFor(key)), source: "fallback" };
}

export async function resolveHeroCopy(): Promise<{ data: HeroPayload; source: ResolveSource }> {
  return resolveCmsDocument("home.hero", (raw) => parseDocumentPayload("home.hero", raw) as HeroPayload);
}

export async function resolveHomeSections(): Promise<{ data: HomeSectionsPayload; source: ResolveSource }> {
  return resolveCmsDocument(
    "home.sections",
    (raw) => parseDocumentPayload("home.sections", raw) as HomeSectionsPayload,
  );
}

export async function resolveNav(): Promise<{ data: NavPayload; source: ResolveSource }> {
  return resolveCmsDocument("site.nav", (raw) => parseDocumentPayload("site.nav", raw) as NavPayload);
}

export async function resolveFooter(): Promise<{ data: FooterPayload; source: ResolveSource }> {
  return resolveCmsDocument("site.footer", (raw) => parseDocumentPayload("site.footer", raw) as FooterPayload);
}

export async function resolveLegal(
  which: "privacy" | "terms",
): Promise<{ data: LegalPayload; source: ResolveSource }> {
  const key = which === "privacy" ? "legal.privacy" : "legal.terms";
  return resolveCmsDocument(key, (raw) => parseDocumentPayload(key, raw) as LegalPayload);
}

export async function resolveSeo(): Promise<{ data: SeoPayload; source: ResolveSource }> {
  return resolveCmsDocument("seo.site", (raw) => parseDocumentPayload("seo.site", raw) as SeoPayload);
}

export async function resolveCampaign(
  season: "christmas" | "new-year",
  now?: Date,
): Promise<{ data: CampaignPayload; source: ResolveSource; active: boolean }> {
  const key = season === "christmas" ? "campaign.christmas" : "campaign.newyear";
  const resolved = await resolveCmsDocument(key, (raw) => parseDocumentPayload(key, raw) as CampaignPayload);
  // Callers that need wall-clock scheduling should pass `now` after `await connection()`.
  return { ...resolved, active: now ? isCampaignActiveNow(resolved.data, now) : false };
}

export async function resolveActiveCampaigns(now: Date): Promise<{
  christmas: { data: CampaignPayload; source: ResolveSource; active: boolean };
  newYear: { data: CampaignPayload; source: ResolveSource; active: boolean };
}> {
  const [christmas, newYear] = await Promise.all([
    resolveCampaign("christmas", now),
    resolveCampaign("new-year", now),
  ]);
  return { christmas, newYear };
}

export function assertKey(key: string): CmsDocumentKey {
  if (!isCmsDocumentKey(key)) throw new Error(`Unknown CMS document key: ${key}`);
  return key;
}

/** CDN-ready public URL for a marketing asset (consumer origin). */
export function marketingAssetPublicUrl(assetId: string, variant: "full" | "thumb" = "full"): string {
  const base = `/marketing-media/${encodeURIComponent(assetId)}`;
  return variant === "thumb" ? `${base}/thumb` : base;
}
