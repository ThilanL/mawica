"use client";

import { ButtonLink } from "@/components/ui/Button";
import type { Celebration } from "@/content/celebrations";
import { GradientText } from "../GradientText";

type Props = {
  celebration: Celebration;
  /** Bumps on each scene change to retrigger enter animation. */
  animKey: number;
  reducedMotion: boolean;
};

/**
 * Shared hero copy. CTA is rendered twice in the tree (mobile below video /
 * desktop in-column) via HeroCtaButton — this block is eyebrow + headline + body only.
 */
export function HeroContent({ celebration, animKey, reducedMotion }: Props) {
  return (
    <div
      key={animKey}
      className={reducedMotion ? undefined : "hero-copy-enter"}
      style={{ ["--hero-accent" as string]: celebration.theme.accent }}
    >
      <p
        data-hero-copy
        className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#8a3d6e] md:text-sm"
      >
        {celebration.eyebrow}
      </p>
      <GradientText
        as="h1"
        id="hero-title"
        data-hero-copy
        className="mt-3 font-display text-[clamp(2.35rem,8.2vw,3.25rem)] font-semibold leading-[1.08] tracking-tight md:mt-4 md:text-[clamp(2.1rem,4.6vw,3.85rem)] md:leading-[1.06]"
      >
        {/*
          Each approved line is its own block so `text-balance` cannot re-wrap
          "Every Love Story" into three ragged lines over the video.
        */}
        <span className="block text-pretty">{celebration.titleLines[0]}</span>
        <span className="block text-pretty">{celebration.titleLines[1]}</span>
      </GradientText>
      <p
        data-hero-copy
        className="mx-auto mt-4 max-w-md text-base leading-relaxed text-[#3f2f52]/90] text-pretty md:mx-0 md:mt-5 md:max-w-[26rem] md:text-lg"
      >
        {celebration.body}
      </p>
    </div>
  );
}

export function HeroCtaButton({ label }: { label: string }) {
  return (
    <ButtonLink
      href="/create"
      className="group gap-2.5 bg-[#301B43] px-7 py-3.5 text-ivory shadow-[0_14px_34px_-12px_rgb(42_27_61/0.55)] hover:bg-[#3d2a56]"
    >
      {label}
      <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5">
        →
      </span>
    </ButtonLink>
  );
}
