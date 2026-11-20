"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { AccountNav } from "@/components/auth/AccountNav";
import { ButtonLink } from "@/components/ui/Button";
import type { NavPayload } from "@/modules/cms/schemas";

function SearchLink({ href, ariaLabel }: { href: string; ariaLabel: string }) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="grid size-10 place-items-center rounded-full text-midnight/75 transition hover:bg-midnight/5 hover:text-midnight focus-visible:outline-offset-4"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M16.2 16.2 20 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </Link>
  );
}

export function SiteHeader({ nav }: { nav: NavPayload }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled || open ? "bg-ivory/80 shadow-[0_1px_0_rgb(42_27_61/0.06)] backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <div className="mx-auto grid h-[4.25rem] max-w-[90rem] grid-cols-[1fr_auto] items-center gap-4 px-5 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1.1fr)] lg:gap-6">
        <div className="min-w-0 justify-self-start">
          <Logo priority className="[&_img]:h-11 sm:[&_img]:h-12" />
        </div>

        <nav aria-label="Primary" className="hidden items-center justify-center gap-0.5 lg:flex">
          {nav.links.map((l) => (
            <a
              key={`${l.href}-${l.label}`}
              href={l.href}
              className="rounded-full px-3.5 py-2 text-[0.92rem] font-medium text-midnight/75 transition hover:bg-white/40 hover:text-midnight"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center justify-end gap-2 lg:flex">
          <SearchLink href={nav.searchHref} ariaLabel={nav.searchAriaLabel} />
          <AccountNav outlined />
          <ButtonLink href="/create" size="md" className="gap-1.5 px-5 shadow-[0_10px_24px_-12px_rgb(42_27_61/0.5)]">
            {nav.createCta}
            <span aria-hidden>→</span>
          </ButtonLink>
        </div>

        <button
          type="button"
          className="relative grid h-11 w-11 place-items-center justify-self-end rounded-full lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden className={`absolute h-0.5 w-5 bg-midnight transition-transform ${open ? "rotate-45" : "-translate-y-1.5"}`} />
          <span aria-hidden className={`absolute h-0.5 w-5 bg-midnight transition-opacity ${open ? "opacity-0" : ""}`} />
          <span aria-hidden className={`absolute h-0.5 w-5 bg-midnight transition-transform ${open ? "-rotate-45" : "translate-y-1.5"}`} />
        </button>
      </div>

      <div id="mobile-menu" hidden={!open} className="border-t border-midnight/10 bg-ivory/95 backdrop-blur-xl lg:hidden">
        <nav aria-label="Mobile" className="mx-auto flex max-w-7xl flex-col gap-1 px-5 py-4 sm:px-8">
          {nav.links.map((l) => (
            <a key={`${l.href}-${l.label}`} href={l.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-lg font-medium">
              {l.label}
            </a>
          ))}
          <div className="mt-3 flex flex-col gap-3">
            <ButtonLink href="/create" onClick={() => setOpen(false)} className="gap-1.5">
              {nav.createCta}
              <span aria-hidden>→</span>
            </ButtonLink>
            <AccountNav mobile onNavigate={() => setOpen(false)} />
          </div>
        </nav>
      </div>
    </header>
  );
}
