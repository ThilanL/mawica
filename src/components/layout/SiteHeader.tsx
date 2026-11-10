"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { AccountNav } from "@/components/auth/AccountNav";
import { ButtonLink } from "@/components/ui/Button";
import { navLinks } from "@/content/site";

export function SiteHeader() {
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
        scrolled || open ? "bg-ivory/85 backdrop-blur-xl shadow-[0_1px_0_rgb(42_27_61/0.08)]" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
        <Logo priority />
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} className="rounded-full px-3.5 py-2 text-sm font-medium text-midnight/80 transition hover:bg-midnight/5 hover:text-midnight">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <AccountNav />
          <ButtonLink href="/create" size="md">Create Free Card</ButtonLink>
        </div>
        <button
          type="button"
          className="relative grid h-11 w-11 place-items-center rounded-full lg:hidden"
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
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-lg font-medium">
              {l.label}
            </a>
          ))}
          <div className="mt-3 flex flex-col gap-3">
            <ButtonLink href="/create" onClick={() => setOpen(false)}>Create Free Card</ButtonLink>
            <AccountNav mobile onNavigate={() => setOpen(false)} />
          </div>
        </nav>
      </div>
    </header>
  );
}
