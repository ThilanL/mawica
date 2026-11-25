import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { company } from "@/content/company";
import "./site-footer.css";

const cols = [
  { title: "Cards", links: [["Christmas Cards", "/#christmas"], ["New Year Cards", "/#new-year"], ["Create Free Card", "/create"]] },
  { title: "Mawica", links: [["How It Works", "/#how-it-works"], ["About", "/about"], ["Contact", "/about#contact"], ["Sign In", "/sign-in"]] },
  { title: "Legal", links: [["Privacy Policy", "/privacy"], ["Terms of Use", "/terms"]] },
] as const;

const traits = ["No app needed", "Opens on any phone", "Link, WhatsApp or QR"] as const;

export function SiteFooter() {
  return (
    <footer className="ft relative isolate overflow-hidden text-ivory">
      <div aria-hidden className="ft-aurora pointer-events-none absolute inset-x-0 top-0 -z-10 h-[24rem]" />

      {/* Brand + navigation */}
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-8 gap-y-12 px-5 py-16 sm:px-8 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1">
          <div className="ft-wordmark inline-block">
            <Wordmark variant="full" size="lg" surface="dark" />
          </div>
          <p className="mt-6 max-w-sm text-[0.95rem] leading-relaxed text-ivory/75">
            Premium digital greeting cards, personalised in moments and shared anywhere in the world. Starting with Christmas and New Year.
          </p>
          <Link href="/about" className="ft-origin mt-6 inline-flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition">
            <svg viewBox="0 0 24 24" aria-hidden className="size-5 shrink-0 text-gold" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" />
            </svg>
            <span>
              <span className="block font-semibold text-ivory">Australian made &amp; owned</span>
              <span className="block text-ivory/70">Launching in 7 countries <span aria-hidden>→</span></span>
            </span>
          </Link>
          <ul className="mt-5 flex flex-wrap gap-2">
            {traits.map((t) => (
              <li key={t} className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-ivory/85 ring-1 ring-white/10">
                {t}
              </li>
            ))}
          </ul>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-gold">{c.title}</h2>
            <ul className="mt-5 space-y-3.5">
              {c.links.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="ft-link text-ivory/80 transition hover:text-white">{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {/* Legal bar */}
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 text-sm text-ivory/65 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© 2026 mawica. All rights reserved.</p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" aria-hidden className="size-4 text-gold" fill="none" stroke="currentColor" strokeWidth={1.6}>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" />
              </svg>
              English · 7 countries
            </span>
            <span aria-hidden className="hidden text-ivory/30 sm:inline">|</span>
            <a href={`mailto:${company.email}`} className="transition hover:text-white">{company.email}</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
