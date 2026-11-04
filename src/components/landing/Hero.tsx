"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ButtonLink } from "@/components/ui/Button";
import { useMediaQuery, usePrefersReducedMotion } from "@/lib/useMediaQuery";
import { HeroArtwork } from "./HeroArtwork";
import { WatchMagic } from "./WatchMagic";

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  const compact = useMediaQuery("(max-width: 767px)");

  // Entrance animation
  useEffect(() => {
    if (reduced || !root.current) return;
    const ctx = gsap.context(() => {
      // Progressive enhancement: content is already visible in the SSR HTML.
      // Only transforms animate on text and globe; nothing is ever set to opacity 0.
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from("[data-hero=halo]", { scale: 0.85, duration: 1.6 })
        .from("[data-hero=enter]", { y: 28, scale: 0.96, duration: 1.3 }, 0)
        .from("[data-in]", { y: 18, duration: 0.9, stagger: 0.1 }, 0.1)
        .from("[data-hero=light]", { opacity: 0, duration: 1.2, stagger: 0.08 }, 0.6);
    }, root);
    return () => ctx.revert();
  }, [reduced]);

  // Desktop pointer parallax (fine pointers only, never with reduced motion)
  useEffect(() => {
    const el = root.current;
    if (!el || reduced || !finePointer) return;
    const layers = Array.from(el.querySelectorAll<HTMLElement>("[data-depth]")).map((node) => ({
      x: gsap.quickTo(node, "x", { duration: 0.9, ease: "power3.out" }),
      y: gsap.quickTo(node, "y", { duration: 0.9, ease: "power3.out" }),
      d: Number(node.dataset.depth),
    }));
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      layers.forEach((l) => { l.x(nx * l.d); l.y(ny * l.d); });
    };
    const leave = () => layers.forEach((l) => { l.x(0); l.y(0); });
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); };
  }, [reduced, finePointer]);

  return (
    <section ref={root} aria-labelledby="hero-title" className="relative overflow-hidden bg-[radial-gradient(120%_80%_at_80%_10%,#e9defa_0%,transparent_60%),linear-gradient(180deg,#fff8f4,#f7e6ef_130%)]">
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 pb-12 pt-6 sm:gap-12 sm:px-8 sm:pb-20 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pb-16">
        <div className="text-center lg:text-left">
          <p data-in className="text-sm font-semibold uppercase tracking-[0.22em] text-rose" style={{ color: "#a63d78" }}>
            Christmas &amp; New Year 2026
          </p>
          <h1 id="hero-title" data-in className="mt-4 font-display text-[clamp(2.5rem,7.5vw,5.5rem)] leading-[1.02] tracking-tight text-balance">
            A Little Magic.<br />A Lot of Love.
          </h1>
          <p data-in className="mx-auto mt-4 max-w-xl text-base sm:mt-6 sm:text-lg leading-relaxed text-ink-soft text-pretty lg:mx-0">
            Create beautiful, personalised, magical greeting cards for free. Add a name and a heartfelt message, then share it in seconds by link, WhatsApp or QR code.
          </p>
          <div data-in className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start">
            <ButtonLink href="/create">Create Free Card</ButtonLink>
            <WatchMagic />
          </div>
        </div>
        <div data-in className="pb-6">
          <HeroArtwork snowCount={compact ? 40 : 90} />
        </div>
      </div>
    </section>
  );
}
