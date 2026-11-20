import type { CampaignPayload } from "@/modules/cms/schemas";
import { publicMarketingUrl } from "@/modules/cms/marketing-media/paths";
import { Reveal } from "@/components/ui/Reveal";

/**
 * Seasonal campaign strip for existing homepage anchors (#christmas / #new-year).
 * Images load eagerly at thumb size when present; videos use poster-less lazy controls
 * and never autoplay so large marketing video is not fetched until the visitor plays.
 */
export function CampaignBanner({
  campaign,
  active,
}: {
  campaign: CampaignPayload;
  active: boolean;
}) {
  if (!active) return null;

  const mediaId = campaign.mediaAssetId;
  const thumbSrc = mediaId ? publicMarketingUrl(mediaId, "thumb") : null;
  const fullSrc = mediaId ? publicMarketingUrl(mediaId, "full") : null;

  return (
    <Reveal>
      <aside
        className="mb-8 overflow-hidden rounded-[1.75rem] bg-white/70 shadow-soft ring-1 ring-midnight/5"
        aria-label={`${campaign.title} campaign`}
      >
        <div className="grid gap-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="flex flex-col justify-center p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lavender" style={{ color: "#6c4fb5" }}>
              Seasonal campaign
            </p>
            <h3 className="mt-2 font-display text-3xl leading-tight">{campaign.title}</h3>
            <p className="mt-3 text-ink-soft text-pretty">{campaign.description}</p>
            <a
              href={campaign.ctaHref}
              className="mt-5 inline-flex w-fit items-center rounded-full bg-midnight px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              {campaign.ctaLabel}
            </a>
          </div>
          {fullSrc ? (
            <div className="relative min-h-[12rem] bg-midnight/5">
              {/* Prefer thumb for LCP; full image only when no thumb (rare). Videos stay behind controls. */}
              {thumbSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbSrc}
                  alt={campaign.title}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <video
                  controls
                  preload="none"
                  playsInline
                  className="h-full w-full object-cover"
                  aria-label={campaign.title}
                >
                  <source src={fullSrc} />
                </video>
              )}
            </div>
          ) : null}
        </div>
      </aside>
    </Reveal>
  );
}
