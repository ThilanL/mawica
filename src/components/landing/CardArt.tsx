import type { CardTheme } from "@/content/site";

export type CardArtRatio = "16x10" | "4x5" | "9x17";
/** Delivered widths per ratio (rendered by scripts/render-catalogue.mjs, see docs/catalogue-3d.md). */
const WIDTHS: Record<CardArtRatio, [number, number]> = { "16x10": [640, 1280], "4x5": [480, 960], "9x17": [360, 720] };
const SIZE: Record<CardArtRatio, [number, number]> = { "16x10": [1280, 800], "4x5": [960, 1200], "9x17": [720, 1360] };
const SIZES: Record<CardArtRatio, string> = { "16x10": "(min-width: 1024px) 320px, (min-width: 640px) 45vw, 92vw", "4x5": "(min-width: 1024px) 300px, (min-width: 640px) 45vw, 92vw", "9x17": "(min-width: 1024px) 220px, 60vw" };
const back: Record<CardTheme, string> = {
  "snow-globe": "#3a2556", "christmas-tree": "#10262a", "special-gift": "#3a1c4a", "warm-wishes": "#3a1c24", "new-year-2027": "#21113a", "new-year-celebration": "#2c1745",
};

/**
 * Catalogue thumbnail: an optimised pre-rendered WebP of the card's own 3D scene (two sizes per aspect ratio, responsive `srcset`, lazy-loaded
 * with a plum placeholder). A plain `<img>`: no JavaScript, no three.js, nothing to hydrate. The container decides the aspect; the picture covers it.
 */
export function CardArt({ theme, className = "", ratio = "4x5" }: { theme: CardTheme; className?: string; ratio?: CardArtRatio }) {
  const [small, large] = WIDTHS[ratio];
  const [w, h] = SIZE[ratio];
  const src = (px: number) => `/art/catalogue/${theme}-${ratio}-${px}.webp`;
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: back[theme] }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-optimised static WebP with its own srcset; next/image's optimiser adds nothing here */}
      <img src={src(large)} srcSet={`${src(small)} ${small}w, ${src(large)} ${large}w`} sizes={SIZES[ratio]} width={w} height={h} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 size-full object-cover" />
    </div>
  );
}
