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
  // The render has transparent margin above and below the subject. The visible crop box trims it so the
  // layout does not reserve empty space; the full image (and every % coordinate) stays in the inner box.
  const { top, bottom } = a.crop;
  const visible = (100 - top - bottom) / 100;
  return (
    <div className="relative mx-auto w-full max-w-[22rem] sm:max-w-[30rem] lg:max-w-[46rem] xl:max-w-[50rem] lg:-mr-8" style={{ aspectRatio: `${a.width} / ${a.height * visible}` }}>
      <div data-hero="halo" data-depth="-14" aria-hidden className="absolute -inset-[8%] rounded-full bg-[radial-gradient(closest-side,rgb(217_105_163/0.22),rgb(156_126_219/0.14)_55%,transparent)] blur-2xl" />
      <div data-hero="globe" data-depth="12" className="absolute inset-x-0" style={{ top: `${-(top / 100 / visible) * 100}%`, height: `${100 / visible}%` }}>
        <div data-hero="enter" className="size-full"><div className="globe-float relative size-full">
          <Image
            src={a.src}
            alt={a.alt}
            fill
            priority
            unoptimized={a.src.endsWith(".svg")}
            sizes="(min-width: 1024px) 34rem, 90vw"
            className="object-contain drop-shadow-[0_24px_30px_rgb(42_27_61/0.18)]"
          />
          <div aria-hidden className="absolute inset-0" style={{ clipPath: a.snowClip }}>
            <SnowCanvas count={snowCount} />
          </div>
          <div aria-hidden className="absolute inset-0">
            {a.lights.map((l, i) => (
              <span
                key={i}
                data-hero="light" className="light-glow absolute rounded-full"
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
      </div>
      {a.isPlaceholder && (
        <p className="absolute -bottom-7 left-0 right-0 text-center text-xs text-ink-soft/70">
          Temporary artwork, final render coming
        </p>
      )}
    </div>
  );
}
