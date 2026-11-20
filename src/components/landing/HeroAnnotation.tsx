import { heroCopy } from "@/content/hero";

/** Decorative handwritten note beside the globe — non-interactive, hidden on small phones. */
export function HeroAnnotation() {
  const lines = heroCopy.annotation;
  return (
    <p
      aria-hidden
      data-in
      className="hero-annotation pointer-events-none absolute right-[4%] top-[6%] z-[3] hidden max-w-[9.5rem] select-none text-center leading-[1.15] text-midnight/75 sm:block lg:right-[6%] lg:top-[4%] xl:right-[10%]"
    >
      <span className="block">{lines[0]}</span>
      <span className="block">{lines[1]}</span>
      <span className="inline-flex items-center justify-center gap-1">
        {lines[2]}
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden className="text-rose">
          <path
            d="M12 20s-7-4.35-7-9.2A3.8 3.8 0 0 1 12 7.6 3.8 3.8 0 0 1 19 10.8C19 15.65 12 20 12 20Z"
            fill="currentColor"
          />
        </svg>
      </span>
      <svg className="hero-annotation-flourish mx-auto mt-1" width="72" height="18" viewBox="0 0 72 18" fill="none" aria-hidden>
        <path
          d="M2 12C14 2 28 2 36 8C44 14 52 16 70 6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          className="text-rose/70"
        />
      </svg>
    </p>
  );
}
