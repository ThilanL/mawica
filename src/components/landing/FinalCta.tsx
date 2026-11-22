"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { finalCtaArt, finalCtaCopy } from "@/content/finalCta";
import { useMediaQuery, usePrefersReducedMotion } from "@/lib/useMediaQuery";
import { FinalCtaSparkle } from "./FinalCtaSparkle";

export function FinalCta() {
  const root = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  const [inView, setInView] = useState(true);
  const [armed, setArmed] = useState(false);
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const el = root.current;
    if (!el || reduced) return;
    // Keep content visible without JS / above the fold; only arm hide-then-reveal when below fold.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.88) {
      setInView(true);
      return;
    }
    setArmed(true);
    setInView(false);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.28 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  useEffect(() => {
    const el = root.current;
    if (!el || reduced || !finePointer) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      setCursor({
        x: (e.clientX - r.left) / r.width,
        y: (e.clientY - r.top) / r.height,
      });
    };
    el.addEventListener("pointermove", move);
    return () => el.removeEventListener("pointermove", move);
  }, [reduced, finePointer]);

  const reveal = !armed || inView || reduced;

  return (
    <section
      ref={root}
      aria-labelledby="cta-title"
      className="relative overflow-hidden bg-[#FFF9F5]"
    >
      {/* Mobile: full-width photo strip so both families stay visible */}
      <div className="relative md:hidden">
        <Image
          src={finalCtaArt.mobile.src}
          alt={finalCtaArt.alt}
          width={finalCtaArt.mobile.width}
          height={finalCtaArt.mobile.height}
          className="h-auto w-full object-contain"
          sizes="100vw"
          priority={false}
        />
      </div>

      {/* Desktop / tablet: cinematic full-bleed background */}
      <div className="pointer-events-none absolute inset-0 z-0 hidden md:block" aria-hidden>
        <Image
          src={finalCtaArt.desktop.src}
          alt=""
          fill
          className="object-cover object-center"
          sizes="100vw"
          priority={false}
        />
      </div>

      {/* Soft centre veil for copy contrast — desktop only; keeps faces clear */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] hidden md:block"
        style={{
          background:
            "radial-gradient(42% 58% at 50% 48%, rgb(255 249 245 / 0.78) 0%, rgb(248 237 242 / 0.42) 45%, transparent 72%)",
        }}
      />

      {finePointer && !reduced ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] hidden mix-blend-soft-light md:block"
          style={{
            background: `radial-gradient(36% 40% at ${cursor.x * 100}% ${cursor.y * 100}%, rgb(216 180 119 / 0.22), transparent 70%)`,
          }}
        />
      ) : null}

      <FinalCtaSparkle active={inView} />

      <div className="relative z-[3] mx-auto flex max-w-3xl flex-col items-center px-5 py-12 text-center sm:px-8 md:min-h-[clamp(22rem,42vw,34rem)] md:justify-center md:py-16 lg:py-20">
        <p
          className={`text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#80658E] sm:text-sm ${
            reveal ? "final-cta-in" : "final-cta-out"
          }`}
          style={{ transitionDelay: reduced ? "0ms" : "40ms" }}
        >
          {finalCtaCopy.eyebrow}
        </p>

        <h2
          id="cta-title"
          className={`mt-3 font-display text-[clamp(2.1rem,5vw,3.75rem)] font-semibold leading-[1.08] tracking-tight text-[#301B43] text-balance sm:mt-4 ${
            reveal ? "final-cta-in" : "final-cta-out"
          }`}
          style={{ transitionDelay: reduced ? "0ms" : "120ms" }}
        >
          {finalCtaCopy.titleLines[0]}
          <br />
          {finalCtaCopy.titleLines[1]}
        </h2>

        <p
          className={`mx-auto mt-4 max-w-xl text-base leading-relaxed text-[#5d4b73] text-pretty sm:mt-5 sm:text-lg ${
            reveal ? "final-cta-in" : "final-cta-out"
          }`}
          style={{ transitionDelay: reduced ? "0ms" : "220ms" }}
        >
          {finalCtaCopy.body}
        </p>

        <div
          className={`mt-8 sm:mt-9 ${reveal ? "final-cta-in" : "final-cta-out"}`}
          style={{ transitionDelay: reduced ? "0ms" : "320ms" }}
        >
          <ButtonLink
            href="/create"
            className="group gap-2.5 bg-[#301B43] px-8 py-3.5 text-ivory shadow-[0_14px_34px_-12px_rgb(48_27_67/0.55)] hover:bg-[#3d2a56] hover:shadow-[0_16px_36px_-12px_rgb(216_180_119/0.45)]"
          >
            {finalCtaCopy.cta}
            <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5">
              →
            </span>
          </ButtonLink>
        </div>

        <p
          className={`mt-4 text-sm text-[#80658E]/90 ${reveal ? "final-cta-in" : "final-cta-out"}`}
          style={{ transitionDelay: reduced ? "0ms" : "400ms" }}
        >
          {finalCtaCopy.note}
        </p>
      </div>
    </section>
  );
}
