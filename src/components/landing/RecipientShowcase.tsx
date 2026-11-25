import type { ReactNode } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { CardArt } from "./CardArt";
import "./recipient-showcase.css";

/* What the recipient experiences, in order. Keep in step with the card page (link sharing, music, "Create your own card" ending). */
const journey: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "A link arrives",
    body: "In WhatsApp, a message, an email or from a QR code. One tap opens it.",
    icon: (
      <>
        <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
        <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
      </>
    ),
  },
  {
    title: "Their card comes alive",
    body: "Their name, your words, gentle animation and music, made for the screen in their hand.",
    icon: <path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" />,
  },
  {
    title: "The magic travels on",
    body: "When it ends, they can create a card of their own and pass the feeling along.",
    icon: <path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z" />,
  },
];

function PhoneMock() {
  return (
    <figure className="relative flex flex-col items-center">
      <div aria-hidden className="rs-halo" />

      <div className="rs-phone relative w-[15.5rem] rounded-[2.9rem] p-[0.55rem] sm:w-[17.5rem]">
        <span aria-hidden className="rs-btn rs-btn-l1" />
        <span aria-hidden className="rs-btn rs-btn-l2" />
        <span aria-hidden className="rs-btn rs-btn-r" />
        <div className="relative overflow-hidden rounded-[2.4rem]">
          <CardArt theme="snow-globe" ratio="9x17" className="aspect-[9/17]" />
          {/* Status bar + island */}
          <div aria-hidden className="absolute inset-x-0 top-0 flex items-center justify-between px-6 pt-3 text-[0.65rem] font-semibold text-ivory/90">
            <span>9:41</span>
            <span className="h-[1.35rem] w-[5.2rem] rounded-full bg-black" />
            <span className="flex items-center gap-1">
              <svg viewBox="0 0 18 12" className="h-2.5 w-3.5" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="0.8" /><rect x="5" y="5" width="3" height="7" rx="0.8" /><rect x="10" y="2" width="3" height="10" rx="0.8" /><rect x="15" y="0" width="3" height="12" rx="0.8" opacity="0.4" /></svg>
              <svg viewBox="0 0 26 12" className="h-2.5 w-5" fill="none" stroke="currentColor"><rect x="0.5" y="0.5" width="22" height="11" rx="3" /><rect x="2.5" y="2.5" width="15" height="7" rx="1.5" fill="currentColor" stroke="none" /><path d="M24.5 4v4" strokeLinecap="round" /></svg>
            </span>
          </div>
          {/* Greeting above the globe, signature below the base (never over the plaque) */}
          <div className="rs-top-fade absolute inset-x-0 top-0 flex flex-col items-center px-5 pt-12 text-center text-ivory">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-gold">For Ava</p>
            <p className="mt-1.5 whitespace-nowrap font-display text-[1.4rem] leading-tight sm:text-[1.65rem]">Merry Christmas</p>
          </div>
          <div className="rs-bottom-fade absolute inset-x-0 bottom-0 px-5 pb-6 pt-10 text-center text-ivory">
            <p className="font-script text-2xl leading-none text-ivory/95">With love, Sam</p>
          </div>
        </div>
      </div>

      {/* Floating "arrives as a link" bubble */}
      <div aria-hidden className="rs-float rs-bubble absolute -left-6 top-[40%] w-[13.5rem] rounded-2xl p-3 text-left sm:-left-24 lg:-left-32">
        <p className="flex items-center gap-2 text-[0.7rem] font-semibold text-midnight">
          <span className="grid size-5 place-items-center rounded-md bg-midnight text-[0.6rem] text-gold">m.</span>
          Sam sent you a card
          <span className="ml-auto font-normal text-ink-soft">now</span>
        </p>
        <p className="mt-1.5 truncate rounded-lg bg-blush px-2 py-1 text-[0.7rem] text-ink-soft">mawica.com/c/for-ava</p>
      </div>

      {/* Floating "no app" chip */}
      <div aria-hidden className="rs-float rs-float-late rs-chip absolute -right-4 bottom-24 flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold text-midnight sm:-right-14">
        <svg viewBox="0 0 16 16" className="size-3.5" style={{ color: "#a63d78" }} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3 3 7-7" /></svg>
        No app to install
      </div>

      <figcaption className="mt-7 text-sm text-ink-soft">Illustrative preview with sample names</figcaption>
    </figure>
  );
}

export function RecipientShowcase() {
  return (
    <section id="about" aria-labelledby="recipient-title" className="rs-section relative isolate overflow-hidden">
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 py-24 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-20 lg:py-32">
        <div>
          <Reveal className="text-center lg:text-left">
            <p className="text-sm font-semibold uppercase tracking-[0.22em]" style={{ color: "#a63d78" }}>For the person who opens it</p>
            <h2 id="recipient-title" className="mt-4 font-display text-4xl leading-tight tracking-tight text-balance sm:text-5xl">
              A moment made <span className="rs-gradient-text">for their phone</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-soft text-pretty lg:mx-0">
              Mawica is a new home for digital greetings, built around the feeling of opening something made just for you. No app to install, nothing to sign up for.
            </p>
          </Reveal>

          <ol className="rs-journey relative mx-auto mt-10 max-w-xl space-y-4 lg:mx-0">
            {journey.map((s, i) => (
              <Reveal as="li" key={s.title} delay={120 + i * 120} className="rs-step relative flex gap-4 rounded-[1.5rem] p-5">
                <span className="rs-step-icon relative z-10 grid size-11 shrink-0 place-items-center rounded-2xl text-gold">
                  <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                    {s.icon}
                  </svg>
                </span>
                <div>
                  <h3 className="font-display text-xl text-midnight">{s.title}</h3>
                  <p className="mt-1 leading-relaxed text-ink-soft">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>

        <Reveal delay={160} className="flex justify-center px-6 sm:px-0">
          <PhoneMock />
        </Reveal>
      </div>
    </section>
  );
}
