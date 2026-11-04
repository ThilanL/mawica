import Image from "next/image";
import { heroArtwork } from "@/content/hero";
import { SnowCanvas } from "./SnowCanvas";

/**
 * Snow globe stage. Everything positioned over the artwork (snow clip, lights)
 * is driven by `src/content/hero.ts`, so swapping the render needs no code changes.
 * The `data-depth` attributes are read by Hero for pointer parallax.
 */
export function HeroArtwork({ snowCount }: { snowCount: number }) {
  const a = heroArtwork;
  return (
    <div className="relative mx-auto w-full max-w-[17rem] sm:max-w-[26rem] lg:max-w-[34rem]" style={{ aspectRatio: `${a.width} / ${a.height}` }}>
      <div data-hero="halo" data-depth="-14" aria-hidden className="absolute -inset-[12%] rounded-full bg-[radial-gradient(closest-side,rgb(217_105_163/0.28),rgb(156_126_219/0.18)_55%,transparent)] blur-2xl" />
      <div data-hero="globe" data-depth="12" className="absolute inset-0">
        <div className="globe-float relative size-full">
          <Image
            src={a.src}
            alt={a.alt}
            fill
            priority
            unoptimized={a.src.endsWith(".svg")}
            sizes="(min-width: 1024px) 34rem, 90vw"
            className="object-contain drop-shadow-[0_40px_50px_rgb(42_27_61/0.35)]"
          />
          <div aria-hidden className="absolute inset-0" style={{ clipPath: a.snowClip }}>
            <SnowCanvas count={snowCount} />
          </div>
          <div aria-hidden className="absolute inset-0">
            {a.lights.map((l, i) => (
              <span
                key={i}
                className="light-glow absolute rounded-full"
                style={{
                  left: `${l.x}%`,
                  top: `${l.y}%`,
                  width: `${l.size}%`,
                  aspectRatio: "1",
                  animationDelay: `${l.delay}s`,
                  background: `radial-gradient(closest-side, ${l.color === "gold" ? "rgb(244 195 113 / 0.85)" : "rgb(217 105 163 / 0.8)"}, transparent)`,
                  mixBlendMode: "screen",
                }}
              />
            ))}
          </div>
        </div>
      </div>
      {a.isPlaceholder && (
        <p className="absolute -bottom-7 left-0 right-0 text-center text-xs text-ink-soft/70">
          Temporary artwork, final render coming
        </p>
      )}
    </div>
  );
}
