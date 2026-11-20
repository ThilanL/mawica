"use client";

import { useEffect, useRef } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { heroCopy } from "@/content/hero";
import { useMediaQuery, usePrefersReducedMotion } from "@/lib/useMediaQuery";
import { HeroAnnotation } from "./HeroAnnotation";
import { HeroArtwork } from "./HeroArtwork";
import { HeroBenefits } from "./HeroBenefits";
import { HeroPlate } from "./HeroBackdrop";
import { SnowCanvas } from "./SnowCanvas";

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  const compact = useMediaQuery("(max-width: 767px)");

  useEffect(() => {
    if (reduced || !root.current) return;
    let cancelled = false;
    let revert: (() => void) | undefined;
    void import("gsap").then(({ default: gsap }) => {
      if (cancelled || !root.current) return;
      const ctx = gsap.context(() => {
        gsap
          .timeline({ defaults: { ease: "power3.out" } })
          .from("[data-hero=halo]", { scale: 0.88, duration: 1.5 })
          .from("[data-hero=enter]", { y: 24, scale: 0.97, duration: 1.25 }, 0)
          .from("[data-in]", { y: 16, duration: 0.85, stagger: 0.09 }, 0.08);
      }, root);
      revert = () => ctx.revert();
    });
    return () => {
      cancelled = true;
      revert?.();
    };
  }, [reduced]);

  useEffect(() => {
    const el = root.current;
    if (!el || reduced || !finePointer) return;
    let cancelled = false;
    let teardown: (() => void) | undefined;
    void import("gsap").then(({ default: gsap }) => {
      if (cancelled) return;
      const layers = Array.from(el.querySelectorAll<HTMLElement>("[data-depth]")).map((node) => ({
        x: gsap.quickTo(node, "x", { duration: 0.9, ease: "power3.out" }),
        y: gsap.quickTo(node, "y", { duration: 0.9, ease: "power3.out" }),
        d: Number(node.dataset.depth),
      }));
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        layers.forEach((l) => {
          l.x(nx * l.d);
          l.y(ny * l.d);
        });
      };
      const leave = () =>
        layers.forEach((l) => {
          l.x(0);
          l.y(0);
        });
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", leave);
      teardown = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerleave", leave);
      };
    });
    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [reduced, finePointer]);

  return (
    <section
      ref={root}
      aria-labelledby="hero-title"
      className="relative -mt-16 overflow-hidden bg-[radial-gradient(90%_70%_at_70%_20%,#f3e7fb_0%,transparent_55%),linear-gradient(180deg,#fff8f4,#f7e6ef_120%)] pt-16"
    >
      <HeroPlate />
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[1]">
        <SnowCanvas count={compact ? 28 : 55} speed={0.55} color="255,248,244" />
      </div>

      <div className="relative z-[2] mx-auto grid max-w-[90rem] items-center gap-6 px-5 pb-14 pt-4 sm:gap-10 sm:px-8 sm:pb-16 lg:min-h-[calc(100dvh-1rem)] lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:gap-6 lg:pb-12 lg:pt-2 xl:gap-8">
        <div className="order-1 text-center lg:order-none lg:self-center lg:text-left lg:pb-6">
          <p data-in className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#8a3d6e] sm:text-sm">
            {heroCopy.eyebrow}
          </p>
          <h1
            id="hero-title"
            data-in
            className="mt-3 font-display text-[clamp(2.55rem,6.4vw,4.85rem)] font-semibold leading-[1.02] tracking-tight text-midnight text-balance sm:mt-4"
          >
            {heroCopy.titleLines[0]}
            <br />
            {heroCopy.titleLines[1]}
          </h1>
          <p data-in className="mx-auto mt-4 max-w-md text-base leading-relaxed text-ink-soft text-pretty sm:mt-5 sm:text-lg lg:mx-0 lg:max-w-[28rem]">
            {heroCopy.body}
          </p>
          <div data-in className="mt-7 flex justify-center lg:justify-start">
            <ButtonLink href="/create" className="group gap-2.5 px-7 py-3.5 shadow-[0_14px_34px_-12px_rgb(42_27_61/0.55)]">
              {heroCopy.cta}
              <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5">
                →
              </span>
            </ButtonLink>
          </div>
          <div className="flex justify-center lg:justify-start">
            <HeroBenefits />
          </div>
        </div>

        <div className="relative order-2 pb-2 sm:pb-6 lg:order-none lg:pb-8 lg:pt-4">
          <HeroAnnotation />
          <div data-in>
            <HeroArtwork snowCount={compact ? 36 : 70} />
          </div>
        </div>
      </div>
    </section>
  );
}
