import Image from "next/image";
import { heroArtwork } from "@/content/hero";
import { SnowCanvas } from "./SnowCanvas";

/**
 * Transparent Mawica snow globe. Never crop or stretch — object-contain + intrinsic aspect ratio.
 * Interior snowfall is clipped softly to the glass; ambient snowfall lives on the hero section.
 */
export function HeroArtwork({ snowCount }: { snowCount: number }) {
  const a = heroArtwork;
  return (
    <div
      className="relative mx-auto w-full max-w-[17.5rem] sm:max-w-[24rem] md:max-w-[28rem] lg:ml-auto lg:mr-[2%] lg:max-w-none lg:w-[min(100%,36rem)] xl:w-[min(100%,42rem)]"
      style={{ aspectRatio: `${a.width} / ${a.height}` }}
    >
      <div
        data-hero="halo"
        data-depth="-10"
        aria-hidden
        className="absolute left-1/2 top-[42%] h-[70%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(244_195_113/0.28),rgb(217_105_163/0.12)_55%,transparent)] blur-2xl"
      />
      <div data-hero="globe" data-depth="10" className="absolute inset-0">
        <div data-hero="enter" className="globe-float relative size-full">
          <Image
            src={a.src}
            alt={a.alt}
            width={a.width}
            height={a.height}
            priority
            sizes="(min-width: 1280px) 42rem, (min-width: 1024px) 36rem, (min-width: 640px) 24rem, 19rem"
            className="relative z-[1] h-full w-full object-contain drop-shadow-[0_28px_40px_rgb(42_27_61/0.28)]"
          />
          {/* Contact shadow so the base sits in the snow */}
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-[2%] left-1/2 z-0 h-[6%] w-[58%] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(closest-side,rgb(42_27_61/0.28),transparent)] blur-md"
          />
          <div aria-hidden className="absolute inset-0 z-[2]" style={{ clipPath: a.snowClip }}>
            <SnowCanvas count={Math.max(12, Math.round(snowCount * 0.35))} speed={0.7} color="255,248,244" />
          </div>
        </div>
      </div>
    </div>
  );
}
