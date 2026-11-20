import { cardPreviews, type CardPreview } from "@/content/site";
import type { CampaignPayload, HomeSectionsPayload } from "@/modules/cms/schemas";
import { Reveal } from "@/components/ui/Reveal";
import { CampaignBanner } from "./CampaignBanner";
import { CardArt } from "./CardArt";
import { SectionHeading } from "./SectionHeading";

function CardTile({ card, i }: { card: CardPreview; i: number }) {
  return (
    <Reveal as="li" delay={(i % 3) * 90}>
      <article className="group h-full overflow-hidden rounded-[1.75rem] bg-white shadow-soft ring-1 ring-midnight/5 transition duration-500 hover:-translate-y-1.5 hover:shadow-lift">
        <CardArt theme={card.theme} ratio="4x5" className="aspect-[4/5] transition duration-700 group-hover:scale-[1.03]" />
        <div className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lavender" style={{ color: "#6c4fb5" }}>{card.occasion}</p>
          <h3 className="mt-2 font-display text-2xl">{card.title}</h3>
          <p className="mt-2 text-ink-soft">{card.blurb}</p>
        </div>
      </article>
    </Reveal>
  );
}

export type CampaignSlot = {
  data: CampaignPayload;
  active: boolean;
};

/**
 * Product gallery keeps #christmas / #new-year anchors for nav.
 * Campaign banners appear only when published + sectionVisible + inside schedule.
 */
export function CardPreviews({
  copy,
  christmasCampaign,
  newYearCampaign,
}: {
  copy: HomeSectionsPayload;
  christmasCampaign?: CampaignSlot;
  newYearCampaign?: CampaignSlot;
}) {
  const christmas = cardPreviews.filter((c) => c.occasion === "Christmas");
  const newYear = cardPreviews.filter((c) => c.occasion === "New Year");

  return (
    <section aria-labelledby="cards-title" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
      <Reveal>
        <SectionHeading
          id="cards-title"
          eyebrow={copy.galleryEyebrow}
          title={copy.galleryTitle}
          body={copy.galleryBody}
        />
      </Reveal>
      <div id="christmas" className="mt-16 scroll-mt-24">
        {christmasCampaign ? (
          <CampaignBanner campaign={christmasCampaign.data} active={christmasCampaign.active} />
        ) : null}
        <h3 className="mb-6 font-display text-3xl">
          {christmasCampaign?.active ? christmasCampaign.data.title : copy.galleryChristmasHeading}
        </h3>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {christmas.map((c, i) => (
            <CardTile key={c.id} card={c} i={i} />
          ))}
        </ul>
      </div>
      <div id="new-year" className="mt-16 scroll-mt-24">
        {newYearCampaign ? (
          <CampaignBanner campaign={newYearCampaign.data} active={newYearCampaign.active} />
        ) : null}
        <h3 className="mb-6 font-display text-3xl">
          {newYearCampaign?.active ? newYearCampaign.data.title : copy.galleryNewYearHeading}
        </h3>
        <ul className="grid gap-6 sm:grid-cols-2 lg:max-w-[calc(50%+0.75rem)]">
          {newYear.map((c, i) => (
            <CardTile key={c.id} card={c} i={i} />
          ))}
        </ul>
      </div>
    </section>
  );
}
