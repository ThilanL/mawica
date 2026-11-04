import Image, { getImageProps } from "next/image";
import { heroPlates } from "@/content/hero";

/**
 * Scenic plates behind the hero (H2 desktop, H3 mobile). Renders nothing until files are configured, and the
 * section's gradient always sits behind it, so the hero is never blank while an image loads.
 * One <picture> means only the plate for the current viewport is downloaded.
 */
export function HeroPlate() {
  const { desktop, mobile } = heroPlates;
  const fallback = desktop ?? mobile;
  if (!fallback) return null;
  const props = (p: NonNullable<typeof desktop>, sizes: string) =>
    getImageProps({ src: p.src, alt: "", width: p.width, height: p.height, priority: true, sizes }).props;
  const d = desktop ? props(desktop, "100vw") : undefined;
  const m = mobile ? props(mobile, "100vw") : undefined;
  const base = (m ?? d)!;
  const pos = (desktop ?? fallback).position ?? "right bottom";
  return (
    <div aria-hidden data-hero="plate" data-depth="-6" className="pointer-events-none absolute -inset-3 overflow-hidden">
      <picture>
        {d && <source media="(min-width: 1024px)" srcSet={d.srcSet} sizes="100vw" />}
        <img
          {...base}
          alt=""
          className="hero-plate size-full object-cover"
          style={{ objectPosition: pos }}
        />
      </picture>
    </div>
  );
}

/** Transparent foreground ornaments (H4): snow bank, pine and baubles, bottom-right, tablet and up. */
export function HeroOrnaments() {
  const o = heroPlates.ornaments;
  if (!o) return null;
  return (
    <div aria-hidden data-hero="ornaments" data-depth="22" className="pointer-events-none absolute bottom-0 right-0 hidden w-[min(62vw,52rem)] md:block">
      <Image src={o.src} alt="" width={o.width} height={o.height} sizes="(min-width: 1280px) 52rem, 62vw" className="h-auto w-full" />
    </div>
  );
}
