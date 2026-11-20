import type { LegalPayload } from "@/modules/cms/schemas";
import { LegalDraftBanner } from "@/components/ui/LegalPage";

/** Renders published CMS legal payload as plain text (no HTML injection). */
export function LegalCmsArticle({ data }: { data: LegalPayload }) {
  return (
    <article className="mx-auto max-w-3xl px-5 py-16 sm:px-8 lg:py-24">
      {data.showDraftBanner ? <LegalDraftBanner /> : null}
      <h1 className="font-display text-4xl sm:text-5xl">{data.title}</h1>
      <p className="mt-3 text-sm text-ink-soft">Last updated: {data.updated}</p>
      <div className="mt-10 space-y-8 text-lg leading-relaxed text-midnight/90 [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-2xl">
        {data.sections.map((section, si) => (
          <section key={`${si}-${section.heading}`}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((p, pi) => (
              <p key={pi} className="mt-3 first:mt-0">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}
