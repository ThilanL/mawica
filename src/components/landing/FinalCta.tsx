import { ButtonLink } from "@/components/ui/Button";
import type { HomeSectionsPayload } from "@/modules/cms/schemas";
import { Reveal } from "@/components/ui/Reveal";

export function FinalCta({ copy }: { copy: Pick<HomeSectionsPayload, "finalCtaTitle" | "finalCtaBody" | "finalCtaLabel"> }) {
  return (
    <section aria-labelledby="cta-title" className="px-5 py-24 sm:px-8 lg:py-32">
      <Reveal className="mx-auto max-w-5xl overflow-hidden rounded-[2.5rem] bg-[radial-gradient(90%_120%_at_50%_0%,#e9defa,#f7e6ef_70%)] px-6 py-20 text-center shadow-soft ring-1 ring-midnight/5 sm:px-16">
        <h2 id="cta-title" className="font-display text-4xl leading-tight tracking-tight text-balance sm:text-6xl">{copy.finalCtaTitle}</h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-ink-soft">{copy.finalCtaBody}</p>
        <div className="mt-9 flex justify-center">
          <ButtonLink href="/create">{copy.finalCtaLabel}</ButtonLink>
        </div>
      </Reveal>
    </section>
  );
}
