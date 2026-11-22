"use client";

import { celebrations, type CelebrationId } from "@/content/celebrations";

type Props = {
  activeId: CelebrationId;
  /** 0–1 progress through the active scene hold. */
  progress: number;
  onSelect: (id: CelebrationId) => void;
  reducedMotion: boolean;
  /** Tighter spacing for narrow mobile rows. */
  compact?: boolean;
};

function Indicator({ id }: { id: CelebrationId }) {
  if (id === "christmas") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3.5 13.1 8 17.5 9.1 13.1 10.2 12 14.7 10.9 10.2 6.5 9.1 10.9 8 12 3.5Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (id === "birthday") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 4v4M9 6.5c0-1.2 1.3-2 3-2s3 .8 3 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <rect x="6" y="10" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6 14h12" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 19s-6.5-4.1-6.5-8.5A3.5 3.5 0 0 1 12 7.8a3.5 3.5 0 0 1 6.5 2.7C18.5 14.9 12 19 12 19Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CelebrationSelector({ activeId, progress, onSelect, reducedMotion, compact }: Props) {
  return (
    <nav
      aria-label="Celebration scenes"
      className={`relative z-[4] flex flex-nowrap items-center justify-center overflow-x-auto overscroll-x-contain md:justify-start ${
        compact ? "gap-0 max-md:w-full max-md:justify-between" : "gap-1"
      }`}
    >
      {celebrations.map((c, i) => {
        const active = c.id === activeId;
        return (
          <span key={c.id} className="flex shrink-0 items-center gap-0.5">
            {i > 0 && !compact ? (
              <span aria-hidden className="mx-1 text-midnight/25 select-none">
                ·
              </span>
            ) : i > 0 && compact ? (
              <span aria-hidden className="mx-0.5 text-midnight/25 select-none">
                ·
              </span>
            ) : null}
            <button
              type="button"
              aria-current={active ? "true" : undefined}
              aria-label={`${c.label}${active ? ", current scene" : ""}`}
              onClick={() => onSelect(c.id)}
              className={`group relative flex min-h-11 items-center gap-1.5 rounded-full py-2 text-sm font-medium transition-colors duration-300 focus-visible:outline-offset-4 ${
                compact ? "px-2.5 sm:px-3" : "px-3"
              } ${active ? "text-midnight" : "text-midnight/55 hover:text-midnight/85"}`}
            >
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-300 ${
                  active ? "bg-white/70 text-midnight shadow-[inset_0_0_0_1px_rgb(42_27_61/0.1)]" : "text-midnight/45 group-hover:text-midnight/70"
                }`}
                style={active ? { color: c.theme.accent } : undefined}
              >
                <Indicator id={c.id} />
              </span>
              <span className={compact ? "max-[360px]:text-[0.8125rem]" : undefined}>{c.label}</span>
              {active && !reducedMotion ? (
                <span
                  aria-hidden
                  className="absolute inset-x-2 bottom-1 h-[2px] overflow-hidden rounded-full bg-midnight/10 sm:inset-x-3"
                >
                  <span
                    className="block h-full origin-left rounded-full bg-midnight/55"
                    style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }}
                  />
                </span>
              ) : active ? (
                <span aria-hidden className="absolute inset-x-2 bottom-1 h-[2px] rounded-full bg-midnight/40 sm:inset-x-3" />
              ) : null}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
