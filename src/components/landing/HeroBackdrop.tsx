import { getImageProps } from "next/image";
import { heroPlates } from "@/content/hero";

/**
 * Scenic Christmas plate behind the hero. One <picture> so only the current viewport plate downloads.
 * The section keeps a soft gradient fallback while the image loads.
 */
export function HeroPlate() {
  const { desktop, mobile } = heroPlates;
  const fallback = desktop ?? mobile;
  if (!fallback) return null;
  const props = (p: NonNullable<typeof desktop>, sizes: string) =>
    getImageProps({ src: p.src, alt: "", width: p.width, height: p.height, priority: true, sizes, quality: 82 }).props;
  const d = desktop ? props(desktop, "100vw") : undefined;
  const m = mobile ? props(mobile, "100vw") : undefined;
  const base = (m ?? d)!;
  const pos = (desktop ?? fallback).position ?? "center bottom";
  return (
    <div aria-hidden data-hero="plate" data-depth="-6" className="pointer-events-none absolute inset-0 overflow-hidden">
      <picture>
        {d && <source media="(min-width: 1024px)" srcSet={d.srcSet} sizes="100vw" />}
        <img
          {...base}
          alt=""
          className="hero-plate size-full object-cover"
          style={{ objectPosition: pos }}
        />
      </picture>
      {/* Soft veil so left copy stays readable without flattening the scene */}
      <div className="absolute inset-0 bg-[linear-gradient(105deg,rgb(255_248_244/0.72)_0%,rgb(255_248_244/0.38)_38%,rgb(255_248_244/0.08)_58%,transparent_72%)] lg:bg-[linear-gradient(100deg,rgb(255_248_244/0.78)_0%,rgb(255_248_244/0.45)_34%,rgb(255_248_244/0.12)_52%,transparent_68%)]" />
      <div className="hero-shimmer absolute inset-0" />
    </div>
  );
}
