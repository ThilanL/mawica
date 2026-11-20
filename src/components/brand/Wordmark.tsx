import Image from "next/image";

const ASSETS = {
  /** Official wordmark including the tagline (transparent). Prefer on dark surfaces. */
  full: { src: "/brand/mawica-wordmark.png", width: 2000, height: 667, alt: "mawica. Bring your wishes to life." },
  /** Letters only — use when the tagline is rendered separately. */
  mark: { src: "/brand/mawica-mark.png", width: 2000, height: 560, alt: "mawica." },
} as const;

const SIZE: Record<"sm" | "md" | "lg" | "ending", { className: string; sizes: string }> = {
  sm: { className: "h-7 w-auto sm:h-8", sizes: "128px" },
  md: { className: "h-10 w-auto", sizes: "160px" },
  lg: { className: "h-14 w-auto sm:h-16", sizes: "256px" },
  ending: { className: "cin-wordmark-img h-auto w-[min(18rem,78vw)] sm:w-[min(22rem,70vw)]", sizes: "(max-width: 640px) 78vw, 22rem" },
};

type Props = {
  /** `full` includes the baked-in tagline; `mark` is letters only. */
  variant?: keyof typeof ASSETS;
  size?: keyof typeof SIZE;
  /** Light site chrome needs multiply so the purple letters read on ivory. */
  surface?: "light" | "dark";
  priority?: boolean;
  className?: string;
};

/**
 * Official Mawica wordmark asset. Never restyle or recreate the letterforms —
 * only size and the light-surface blend for contrast.
 */
export function Wordmark({ variant = "full", size = "md", surface = "light", priority = false, className = "" }: Props) {
  const asset = ASSETS[variant];
  const sizing = SIZE[size];
  const blend = surface === "light" ? "mix-blend-multiply" : "";
  return (
    <Image
      src={asset.src}
      alt={asset.alt}
      width={asset.width}
      height={asset.height}
      priority={priority}
      sizes={sizing.sizes}
      className={`${sizing.className} ${blend} ${className}`.trim()}
    />
  );
}
