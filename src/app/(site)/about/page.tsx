import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { WorldClocks } from "@/components/about/WorldClocks";
import { WorldMap } from "@/components/about/WorldMap";
import { company } from "@/content/company";
import { launchMarkets } from "@/content/site";
import "@/components/about/about.css";

export const metadata: Metadata = {
  title: "About | mawica.",
  description:
    "mawica.com is an Australian-made, Australian-owned company launching premium digital greeting cards in Australia, the United Kingdom, the United States, Sweden, Finland, the UAE and Sri Lanka.",
  alternates: { canonical: "/about" },
};

const countries = "Australia, the United Kingdom, the United States, Sweden, Finland, the United Arab Emirates and Sri Lanka";

const pillars = [
  {
    title: "Designed in Australia",
    body: "Every card, animation and detail is made by our team in Australia, with the care of a handwritten note.",
    icon: <path d="M12 3l2.6 6.2 6.4.5-4.9 4.2 1.5 6.4L12 17l-5.6 3.3 1.5-6.4L3 9.7l6.4-.5z" />,
  },
  {
    title: "Ready for every market",
    body: "Cards open instantly in any modern browser, on any phone, and scheduled cards handle time zones and daylight saving for you.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" />
      </>
    ),
  },
  {
    title: "Private by design",
    body: "No advertising and no analytics. Your words are for the person you send them to.",
    icon: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
  },
] as const;

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-6" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export default function AboutPage() {
  const details = [
    { label: "Based in", value: company.city ? `${company.city}, ${company.country}` : company.country },
    company.phone && { label: "Phone", value: company.phone, href: `tel:${company.phone.replace(/\s+/g, "")}` },
    company.abn && { label: "ABN", value: company.abn },
  ].filter(Boolean) as { label: string; value: string; href?: string }[];

  return (
    <>
      {/* Hero */}
      <section aria-labelledby="about-title" className="ab-hero relative overflow-hidden">
        <div className="mx-auto max-w-4xl px-5 py-20 text-center sm:px-8 lg:py-28">
          <p className="text-sm font-semibold uppercase tracking-[0.22em]" style={{ color: "#a63d78" }}>About mawica.</p>
          <h1 id="about-title" className="mt-5 font-display text-5xl leading-[1.05] tracking-tight text-balance sm:text-6xl lg:text-7xl">
            Australian made. <span className="ab-gradient-text">Made for the world.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-ink-soft text-pretty sm:text-xl">
            mawica.com is an Australian-made, Australian-owned company. We&rsquo;re launching in seven countries at the same time, so a card can travel from Sydney to Stockholm as easily as across the street.
          </p>
          <ul className="mt-9 flex flex-wrap justify-center gap-2.5 text-sm font-medium text-midnight">
            {["Australian made & owned", "Launching in 7 countries", "One simultaneous launch"].map((t) => (
              <li key={t} className="ab-card inline-flex items-center gap-2 rounded-full px-4 py-2">
                <span aria-hidden className="size-1.5 rounded-full" style={{ background: "#a63d78" }} />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* World */}
      <section aria-labelledby="world-title" className="ab-world">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
          <div className="grid items-end gap-6 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: "#a63d78" }}>Available worldwide</p>
              <h2 id="world-title" className="mt-4 font-display text-4xl leading-tight tracking-tight text-balance sm:text-5xl">
                One card. Seven countries. <span className="ab-gradient-text">Every time zone.</span>
              </h2>
            </div>
            <p className="max-w-xl text-lg leading-relaxed text-ink-soft text-pretty">
              From day one, mawica. is available in {countries}. Every card opens instantly in the browser, wherever your people are.
            </p>
          </div>
          <div className="ab-map-card mt-10 rounded-[2rem] p-4 sm:p-8 lg:mt-14 lg:p-12">
            <div className="mx-auto max-w-5xl">
              <WorldMap />
            </div>
          </div>
          <div className="mt-6 lg:mt-8">
            <WorldClocks markets={launchMarkets} />
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section aria-labelledby="pillars-title" className="bg-ivory">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-24">
          <h2 id="pillars-title" className="sr-only">What we stand for</h2>
          <ul className="grid gap-5 md:grid-cols-3">
            {pillars.map((p) => (
              <li key={p.title} className="ab-card rounded-[1.75rem] p-7 sm:p-8">
                <span className="grid size-12 place-items-center rounded-2xl text-gold" style={{ background: "linear-gradient(160deg, #4a2a66, #2a1b3d)" }}>
                  <Icon>{p.icon}</Icon>
                </span>
                <h3 className="mt-6 font-display text-2xl">{p.title}</h3>
                <p className="mt-2.5 leading-relaxed text-ink-soft">{p.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" aria-labelledby="contact-title" className="ab-world">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:gap-16 lg:py-28">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: "#a63d78" }}>Contact</p>
            <h2 id="contact-title" className="mt-4 font-display text-4xl leading-tight tracking-tight sm:text-5xl">Say hello</h2>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-soft text-pretty">
              Questions, partnerships, press or support in any of our launch countries: write to us and a real person will reply.
            </p>
            <Link
              href="/create"
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-midnight px-7 py-3.5 text-sm font-semibold text-ivory shadow-soft transition hover:bg-[#3a2556] focus-visible:outline-offset-4"
            >
              Create a free card <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="ab-card rounded-[2rem] p-7 sm:p-10">
            <p className="text-sm font-semibold text-ink-soft">Email</p>
            <a href={`mailto:${company.email}`} className="mt-1 inline-block break-all font-display text-3xl text-midnight underline decoration-[#d969a3]/40 decoration-2 underline-offset-8 transition hover:decoration-[#d969a3] sm:text-4xl">
              {company.email}
            </a>
            <dl className="mt-8 grid gap-5 border-t border-midnight/10 pt-7 sm:grid-cols-2">
              {details.map((d) => (
                <div key={d.label}>
                  <dt className="text-sm font-semibold text-ink-soft">{d.label}</dt>
                  <dd className="mt-1 text-lg text-midnight">{d.href ? <a href={d.href} className="hover:underline">{d.value}</a> : d.value}</dd>
                </div>
              ))}
              <div>
                <dt className="text-sm font-semibold text-ink-soft">Available in</dt>
                <dd className="mt-1 text-lg text-midnight">7 countries</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </>
  );
}
