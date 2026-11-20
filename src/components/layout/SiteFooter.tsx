import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import type { FooterPayload } from "@/modules/cms/schemas";

export function SiteFooter({ footer }: { footer: FooterPayload }) {
  return (
    <footer className="bg-midnight text-ivory">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Wordmark variant="full" size="lg" surface="dark" />
          <p className="mt-6 max-w-xs text-sm text-ivory/70">{footer.tagline}</p>
        </div>
        {footer.columns.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-gold">{c.title}</h2>
            <ul className="mt-4 space-y-3">
              {c.links.map((link) => (
                <li key={`${link.href}-${link.label}`}>
                  <Link href={link.href} className="text-ivory/80 transition hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-sm text-ivory/60 sm:flex-row sm:justify-between sm:px-8">
          <p>{footer.copyright}</p>
          <p>{footer.domainLabel}</p>
        </div>
      </div>
    </footer>
  );
}
