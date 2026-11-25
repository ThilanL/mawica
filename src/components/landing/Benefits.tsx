import Image from "next/image";
import type { ReactNode } from "react";
import { benefits, featureAr, featureSchedule } from "@/content/site";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "./SectionHeading";
import "./benefits.css";

/* Gold line icons for the small tiles (decorative). */
const icons: Record<(typeof benefits)[number]["icon"], ReactNode> = {
  free: (
    <>
      <path d="M5 12h14v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
      <path d="M3.5 8h17v4h-17zM12 8v13" />
      <path d="M12 8c-1.5-3.5-5.5-4-5.5-1.5S10 8 12 8zm0 0c1.5-3.5 5.5-4 5.5-1.5S14 8 12 8z" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
      <path d="M12 7.2l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </>
  ),
  share: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  heart: (
    <>
      <path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z" />
      <path d="M9 11.5c.8-1 2-1.2 3-.4" />
    </>
  ),
};

function LineIcon({ children, className = "size-6" }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function Points({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-6 grid gap-2.5 text-[0.95rem] text-ivory/85">
      {items.map((p) => (
        <li key={p} className="flex gap-3">
          <svg viewBox="0 0 16 16" aria-hidden className="mt-1 size-4 shrink-0 text-gold">
            <path d="M8 1l1.6 5.4L15 8l-5.4 1.6L8 15l-1.6-5.4L1 8l5.4-1.6z" fill="currentColor" />
          </svg>
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}

function Eyebrow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-full bg-gold/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-gold ring-1 ring-gold/25">
      <LineIcon className="size-4">{icon}</LineIcon>
      {children}
    </p>
  );
}

/** Illustrative AR viewfinder: the snow globe placed on a floor, with the real in-app hint. */
function ArScene() {
  return (
    <div aria-hidden className="bf-ar-scene relative mx-auto aspect-[4/3] w-full max-w-[30rem] overflow-hidden rounded-[1.5rem]">
      <div className="bf-ar-floor" />
      <div className="bf-ar-ring" />
      <Image
        src="/art/cards/snow-globe-3d-sm.webp"
        alt=""
        width={577}
        height={546}
        sizes="(min-width: 1024px) 22rem, 70vw"
        className="bf-ar-globe absolute bottom-[14%] left-1/2 w-[52%] -translate-x-1/2"
      />
      {(["tl", "tr", "bl", "br"] as const).map((c) => (
        <span key={c} className={`bf-ar-corner bf-ar-corner-${c}`} />
      ))}
      <span className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap rounded-full bg-midnight/70 px-3.5 py-1.5 text-xs font-medium text-ivory ring-1 ring-white/15 backdrop-blur">
        Tap the card to read it big
      </span>
    </div>
  );
}

/** Illustrative schedule ticket (not a form). */
function ScheduleTicket() {
  return (
    <div aria-hidden className="bf-ticket relative mx-auto w-full max-w-sm rounded-[1.5rem] p-5 text-midnight">
      <div className="flex items-center gap-4">
        <div className="grid w-16 shrink-0 overflow-hidden rounded-xl bg-white text-center shadow-sm ring-1 ring-midnight/10">
          <span className="bg-[#a63d78] py-0.5 text-[0.65rem] font-bold tracking-[0.2em] text-white">DEC</span>
          <span className="py-1 font-display text-3xl leading-none">25</span>
        </div>
        <div className="min-w-0">
          <p className="font-display text-2xl leading-tight">07:00</p>
          <p className="truncate text-sm text-ink-soft">Europe/London · GMT</p>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-midnight/[0.06] px-4 py-3 text-sm">
        <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        <span>Link private until then</span>
      </div>
      <div className="mt-5 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3 text-sm">
        <span className="size-2.5 rounded-full bg-[#a63d78]" />
        <span>Written today</span>
        <span className="bf-pulse size-2.5 rounded-full bg-gold" />
        <span className="font-semibold">Goes live Christmas morning</span>
      </div>
    </div>
  );
}

export function Benefits() {
  return (
    <section aria-labelledby="benefits-title" className="bf-section relative isolate overflow-hidden py-24 text-ivory lg:py-32">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="bf-glow bf-glow-a" />
        <div className="bf-glow bf-glow-b" />
        <div className="bf-stars" />
      </div>

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="[&_p]:text-ivory/75 [&_h2]:text-ivory [&_p:first-child]:!text-gold">
          <SectionHeading
            id="benefits-title"
            eyebrow="Why mawica."
            title="Thoughtful, simple, and a little magical"
            body="Free to make, easy to send, with touches a paper card could never have."
          />
        </Reveal>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Feature: AR */}
          <Reveal as="article" className="bf-tile bf-tile-feature grid items-center gap-8 p-6 sm:col-span-2 sm:p-8 lg:col-span-4 lg:grid-cols-[1fr_1.15fr] lg:gap-12 lg:p-10">
            <ArScene />
            <div>
              <Eyebrow icon={<><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></>}>{featureAr.eyebrow}</Eyebrow>
              <h3 id="bf-ar-title" className="mt-4 font-display text-3xl leading-tight sm:text-4xl">{featureAr.title}</h3>
              <p className="mt-3 text-lg leading-relaxed text-ivory/80 text-pretty">{featureAr.body}</p>
              <Points items={featureAr.points} />
            </div>
          </Reveal>

          {/* Supporting benefits */}
          {benefits.map((b, i) => (
            <Reveal as="article" key={b.title} delay={(i + 1) * 90} className="bf-tile p-6 sm:p-7">
              <span className="bf-chip grid size-12 place-items-center rounded-2xl text-gold">
                <LineIcon>{icons[b.icon]}</LineIcon>
              </span>
              <h3 className="mt-6 font-display text-2xl">{b.title}</h3>
              <p className="mt-2.5 leading-relaxed text-ivory/75">{b.body}</p>
            </Reveal>
          ))}

          {/* Feature: scheduling */}
          <Reveal as="article" delay={120} className="bf-tile bf-tile-feature grid items-center gap-8 p-6 sm:col-span-2 sm:p-8 lg:col-span-4 lg:grid-cols-[1.2fr_1fr] lg:gap-12 lg:p-10">
            <div>
              <Eyebrow icon={<><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2.5h6" /></>}>{featureSchedule.eyebrow}</Eyebrow>
              <h3 className="mt-4 font-display text-3xl leading-tight sm:text-4xl">{featureSchedule.title}</h3>
              <p className="mt-3 text-lg leading-relaxed text-ivory/80 text-pretty">{featureSchedule.body}</p>
              <Points items={featureSchedule.points} />
            </div>
            <ScheduleTicket />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
