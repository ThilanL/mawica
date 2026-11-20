import type { HomeSectionsPayload } from "@/modules/cms/schemas";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "./SectionHeading";

export function HowItWorks({ copy }: { copy: HomeSectionsPayload }) {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="bg-blush/60 py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            id="how-title"
            eyebrow={copy.howItWorksEyebrow}
            title={copy.howItWorksTitle}
            body={copy.howItWorksBody}
          />
        </Reveal>
        <ol className="mt-16 grid gap-6 md:grid-cols-3">
          {copy.steps.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 120} className="rounded-[1.75rem] bg-ivory p-8 shadow-soft ring-1 ring-midnight/5">
              <span className="font-display text-5xl text-lavender" style={{ color: "#8667cc" }}>{s.n}</span>
              <h3 className="mt-6 font-display text-3xl">{s.title}</h3>
              <p className="mt-3 text-lg text-ink-soft">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
