import { benefits } from "@/content/site";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "./SectionHeading";

export function Benefits() {
  return (
    <section aria-labelledby="benefits-title" className="bg-midnight py-24 text-ivory lg:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="[&_p]:text-ivory/75 [&_h2]:text-ivory [&_p:first-child]:!text-gold">
          <SectionHeading id="benefits-title" eyebrow="Why mawica." title="Thoughtful, simple, and free" />
        </Reveal>
        <ul className="mt-16 grid gap-px overflow-hidden rounded-[1.75rem] bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((b, i) => (
            <Reveal as="li" key={b.title} delay={i * 90} className="bg-midnight p-8">
              <span aria-hidden className="block size-2.5 rounded-full bg-gold shadow-[0_0_16px_3px_rgb(244_195_113/0.6)]" />
              <h3 className="mt-6 font-display text-2xl">{b.title}</h3>
              <p className="mt-3 text-ivory/75">{b.body}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
