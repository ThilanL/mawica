import { Reveal } from "@/components/ui/Reveal";
import { CardArt } from "./CardArt";

export function RecipientShowcase() {
  return (
    <section id="about" aria-labelledby="recipient-title" className="mx-auto grid max-w-7xl items-center gap-16 px-5 py-24 sm:px-8 lg:grid-cols-2 lg:py-32">
      <div className="text-center lg:text-left">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-[0.22em]" style={{ color: "#a63d78" }}>For the person who opens it</p>
          <h2 id="recipient-title" className="mt-4 font-display text-4xl leading-tight tracking-tight text-balance sm:text-5xl">A moment made for their phone</h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-soft text-pretty">
            Mawica is a new home for digital greetings, built around the feeling of opening something made just for you. Recipients tap a link and their card comes alive, with their name, your words and a little magic. No app to install.
          </p>
        </Reveal>
      </div>
      <Reveal delay={120} className="flex justify-center">
        <figure className="flex flex-col items-center">
          <div className="relative w-[15.5rem] rounded-[2.6rem] bg-midnight p-2.5 shadow-lift sm:w-[17rem]">
            <div className="relative overflow-hidden rounded-[2.1rem]">
              <CardArt theme="snow-globe" className="aspect-[9/17]" />
              <div className="absolute inset-0 flex flex-col items-center justify-end gap-2 bg-gradient-to-t from-midnight/80 via-transparent px-6 pb-10 text-center text-ivory">
                <p className="text-xs uppercase tracking-[0.2em] text-ivory/80">For Ava</p>
                <p className="font-display text-2xl">Merry Christmas</p>
                <p className="text-sm text-ivory/85">With love, Sam</p>
              </div>
            </div>
            <div aria-hidden className="absolute left-1/2 top-4 h-5 w-20 -translate-x-1/2 rounded-full bg-midnight" />
          </div>
          <figcaption className="mt-5 text-sm text-ink-soft">Illustrative preview with sample names</figcaption>
        </figure>
      </Reveal>
    </section>
  );
}
