import type { CSSProperties, ReactNode } from "react";
import { steps } from "@/content/site";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "./SectionHeading";
import "./how-it-works.css";

/* Line icons drawn in brand gold. `pathLength` lets CSS "draw" them on reveal. */
const icons: Record<(typeof steps)[number]["title"], ReactNode> = {
  Create: (
    <>
      <rect x="9" y="13" width="21" height="27" rx="3" transform="rotate(-10 19.5 26.5)" pathLength={1} opacity={0.55} />
      <rect x="17" y="8" width="22" height="30" rx="3" pathLength={1} />
      <path d="M28 14.5l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z" pathLength={1} />
      <path d="M22.5 31h11M22.5 34.5h7" pathLength={1} />
    </>
  ),
  Personalise: (
    <>
      <path d="M31.5 8.5l8 8L22 34l-10 2.5 2.5-10z" pathLength={1} />
      <path d="M27 13l8 8M14.5 26.5L22 34" pathLength={1} />
      <path d="M8 42.5c2.5-3 4.5-3 6.5 0s4.5 3 7 0 4.5-3 7 0" pathLength={1} />
      <path d="M38 33.5c-1.6-2.2-5-1.2-4.6 1.4.3 2 2.6 3.3 4.6 4.6 2-1.3 4.3-2.6 4.6-4.6.4-2.6-3-3.6-4.6-1.4z" pathLength={1} />
    </>
  ),
  Share: (
    <>
      <path d="M41 7L7 21.5l13 5.5 5.5 13z" pathLength={1} />
      <path d="M20 27L41 7" pathLength={1} />
      <path d="M6 41c4-1 7-3.5 9-8" strokeDasharray="0.1 3.2" className="hiw-trail" />
      <path d="M37 33l1 2.8 2.8 1-2.8 1-1 2.8-1-2.8-2.8-1 2.8-1z" pathLength={1} />
    </>
  ),
};

/* Decorative twinkles scattered around the section (positions in %). */
const sparkles = [
  { x: 8, y: 18, s: 14, d: 0 },
  { x: 92, y: 12, s: 18, d: 1.2 },
  { x: 86, y: 78, s: 12, d: 2.1 },
  { x: 14, y: 84, s: 10, d: 0.6 },
  { x: 50, y: 6, s: 9, d: 1.7 },
];

function Sparkle({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z" fill="currentColor" />
    </svg>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className={`relative isolate overflow-hidden py-24 lg:py-32 hiw-section`}>
      {/* Atmosphere: soft brand glows + twinkles */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="hiw-glow-rose" />
        <div className="hiw-glow-lavender" />
        <div className="hiw-glow-gold" />
        {sparkles.map((p, i) => (
          <span
            key={i}
            className={`absolute hiw-twinkle ${i % 2 ? "text-rose/60" : "text-gold"}`}
            style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${p.d}s` }}
          >
            <Sparkle size={p.s} />
          </span>
        ))}
      </div>

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading id="how-title" eyebrow="How it works" title="Create. Personalise. Share." body="From idea to a card in someone's hands in three simple steps." />
        </Reveal>

        <div className="relative mt-16 lg:mt-20">
          {/* Connecting flow: vertical on phones, horizontal through the medallions from md up */}
          <div aria-hidden className={`pointer-events-none absolute hiw-flow-track`}>
            <Reveal className="relative h-full w-full">
              <div className="hiw-flow-line" />
              <span className="hiw-comet" />
            </Reveal>
          </div>

          <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
            {steps.map((s, i) => (
              <Reveal as="li" key={s.n} delay={i * 160} className={`relative flex flex-col items-center text-center hiw-step`}>
                <div className="hiw-medallion">
                  <svg
                    viewBox="0 0 48 48"
                    aria-hidden
                    className={`relative size-12 hiw-icon`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ "--icon-delay": `${i * 160 + 350}ms` } as CSSProperties}
                  >
                    {icons[s.title]}
                  </svg>
                </div>

                <div className={`relative mt-6 w-full rounded-[2rem] p-px hiw-card-border`}>
                  <div className={`relative h-full overflow-hidden rounded-[calc(2rem-1px)] px-7 pb-9 pt-8 sm:px-8 hiw-card`}>
                    <span aria-hidden className={`pointer-events-none absolute -bottom-8 -right-2 font-display text-[7.5rem] leading-none hiw-numeral`}>
                      {s.n}
                    </span>
                    <p className="relative text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: "#a63d78" }}>
                      Step {s.n}
                    </p>
                    <h3 className="relative mt-3 font-display text-3xl">{s.title}</h3>
                    <p className="relative mx-auto mt-3 max-w-[22rem] text-lg leading-relaxed text-ink-soft text-pretty">{s.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
