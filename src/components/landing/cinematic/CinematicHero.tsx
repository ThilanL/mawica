"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  celebrations,
  HERO_CROSSFADE_MS,
  nextCelebrationIndex,
  type Celebration,
  type CelebrationId,
} from "@/content/celebrations";
import { useMediaQuery, usePrefersReducedMotion } from "@/lib/useMediaQuery";
import { AmbientParticles } from "./AmbientParticles";
import { CelebrationSelector } from "./CelebrationSelector";
import { HeroContent, HeroCtaButton } from "./HeroContent";
import { HeroVideoLayer } from "./HeroVideoLayer";

type Slot = {
  celebration: Celebration;
  opacity: number;
  active: boolean;
  load: boolean;
};

const initialSlots = (): [Slot, Slot] => [
  { celebration: celebrations[0], opacity: 1, active: true, load: true },
  { celebration: celebrations[1], opacity: 0, active: false, load: false },
];

export function CinematicHero() {
  const root = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");

  const [index, setIndex] = useState(0);
  const [slots, setSlots] = useState<[Slot, Slot]>(initialSlots);
  const [, setFront] = useState<0 | 1>(0);
  const [progress, setProgress] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [inView, setInView] = useState(true);
  const [videoFailed, setVideoFailed] = useState(false);
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.4 });
  /** Gate MP4 network until after first paint (poster-first), longer delay on mobile/slow links. */
  const [mediaEnabled, setMediaEnabled] = useState(false);

  const gen = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRaf = useRef(0);
  const transitioning = useRef(false);
  const indexRef = useRef(0);
  const frontRef = useRef<0 | 1>(0);
  const scheduleHoldRef = useRef<(() => void) | null>(null);

  const clearTimers = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (progressRaf.current) {
      cancelAnimationFrame(progressRaf.current);
      progressRaf.current = 0;
    }
  }, []);

  const goTo = useCallback(
    (nextIndex: number, opts?: { manual?: boolean }) => {
      if (reduced) {
        const c = celebrations[nextIndex];
        indexRef.current = nextIndex;
        setIndex(nextIndex);
        setAnimKey((k) => k + 1);
        setProgress(0);
        setSlots([
          { celebration: c, opacity: 1, active: true, load: false },
          { celebration: c, opacity: 0, active: false, load: false },
        ]);
        frontRef.current = 0;
        setFront(0);
        return;
      }

      if (transitioning.current && !opts?.manual) return;
      if (nextIndex === indexRef.current && !opts?.manual) return;

      const token = ++gen.current;
      transitioning.current = true;
      clearTimers();
      setProgress(0);

      const next = celebrations[nextIndex];
      const back = (1 - frontRef.current) as 0 | 1;

      setSlots((prev) => {
        const copy: [Slot, Slot] = [{ ...prev[0] }, { ...prev[1] }];
        copy[back] = { celebration: next, opacity: 0, active: true, load: true };
        copy[frontRef.current] = { ...copy[frontRef.current], active: true };
        return copy;
      });

      requestAnimationFrame(() => {
        if (token !== gen.current) return;
        setSlots((prev) => {
          const copy: [Slot, Slot] = [{ ...prev[0] }, { ...prev[1] }];
          copy[back] = { ...copy[back], opacity: 1, active: true, load: true };
          copy[frontRef.current] = { ...copy[frontRef.current], opacity: 0 };
          return copy;
        });
        indexRef.current = nextIndex;
        setIndex(nextIndex);
        setAnimKey((k) => k + 1);

        window.setTimeout(() => {
          if (token !== gen.current) return;
          const oldFront = frontRef.current;
          frontRef.current = back;
          setFront(back);
          setSlots((prev) => {
            const copy: [Slot, Slot] = [{ ...prev[0] }, { ...prev[1] }];
            copy[oldFront] = {
              ...copy[oldFront],
              active: false,
              load: false,
              opacity: 0,
            };
            copy[back] = { ...copy[back], active: true, opacity: 1, load: true };
            return copy;
          });
          transitioning.current = false;
          scheduleHoldRef.current?.();
        }, HERO_CROSSFADE_MS);
      });
    },
    [clearTimers, reduced],
  );

  const scheduleHold = useCallback(() => {
    clearTimers();
    if (reduced || !inView || videoFailed || transitioning.current) return;

    const start = performance.now();
    const holdMs = celebrations[indexRef.current].durationSec * 1000;
    const preloadAt = Math.max(0, holdMs - 2500);

    const tick = (now: number) => {
      const elapsed = now - start;
      setProgress(Math.min(1, elapsed / holdMs));
      if (elapsed >= preloadAt) {
        const nextIdx = nextCelebrationIndex(indexRef.current);
        const back = (1 - frontRef.current) as 0 | 1;
        setSlots((prev) => {
          if (prev[back].celebration.id === celebrations[nextIdx].id && prev[back].load) return prev;
          const copy: [Slot, Slot] = [{ ...prev[0] }, { ...prev[1] }];
          copy[back] = {
            celebration: celebrations[nextIdx],
            opacity: copy[back].opacity,
            active: false,
            load: true,
          };
          return copy;
        });
      }
      if (elapsed < holdMs) {
        progressRaf.current = requestAnimationFrame(tick);
      }
    };
    progressRaf.current = requestAnimationFrame(tick);

    holdTimer.current = setTimeout(() => {
      goTo(nextCelebrationIndex(indexRef.current));
    }, holdMs);
  }, [clearTimers, goTo, inView, reduced, videoFailed]);

  useEffect(() => {
    scheduleHoldRef.current = scheduleHold;
  }, [scheduleHold]);

  useEffect(() => {
    if (transitioning.current) return;
    scheduleHold();
    return clearTimers;
  }, [inView, reduced, videoFailed, scheduleHold, clearTimers]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setInView(e?.isIntersecting ?? true),
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el || reduced || !finePointer) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      setCursor({
        x: (e.clientX - r.left) / r.width,
        y: (e.clientY - r.top) / r.height,
      });
    };
    el.addEventListener("pointermove", move);
    return () => el.removeEventListener("pointermove", move);
  }, [reduced, finePointer]);

  const onSelect = (id: CelebrationId) => {
    const nextIndex = celebrations.findIndex((c) => c.id === id);
    if (nextIndex < 0 || nextIndex === indexRef.current) {
      scheduleHold();
      return;
    }
    goTo(nextIndex, { manual: true });
  };

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    const enable = () => {
      if (!cancelled) setMediaEnabled(true);
    };

    const conn =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & {
            connection?: { saveData?: boolean; effectiveType?: string };
          }).connection
        : undefined;
    const constrained =
      Boolean(conn?.saveData) ||
      /2g/i.test(conn?.effectiveType ?? "") ||
      window.matchMedia("(max-width: 767px)").matches;

    if (constrained) {
      // Let the ~100KB poster + copy paint before pulling a multi‑MB MP4 on cellular.
      const delay = window.setTimeout(() => {
        const ric = (
          window as Window & {
            requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
          }
        ).requestIdleCallback;
        if (ric) ric(enable, { timeout: 2500 });
        else enable();
      }, 700);
      return () => {
        cancelled = true;
        window.clearTimeout(delay);
      };
    }

    const id = window.requestAnimationFrame(() => enable());
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
    };
  }, [reduced]);

  const active = celebrations[index];
  const showVideo = !reduced && !videoFailed && mediaEnabled;

  return (
    <section
      ref={root}
      aria-labelledby="hero-title"
      className="relative -mt-16 flex flex-col overflow-x-hidden bg-[#fff8f4] pt-16 md:block md:min-h-[calc(100dvh)] md:bg-[#1a1028]"
    >
      {/* 1. Copy — above video on mobile; left overlay on desktop */}
      <div className="relative z-[3] order-1 px-5 pt-3 text-center sm:px-6 md:absolute md:inset-y-0 md:left-0 md:flex md:w-[min(46%,36rem)] md:flex-col md:justify-center md:px-8 md:pb-28 md:pt-20 md:text-left lg:w-[min(44%,40rem)] xl:px-12">
        <HeroContent celebration={active} animKey={animKey} reducedMotion={reduced} />
        <div className="mt-7 hidden justify-start md:flex">
          <HeroCtaButton label={active.cta} />
        </div>
      </div>

      {/* 2. Video — in-flow 16:9 contain on mobile; full-bleed cover on desktop */}
      <div
        className="relative z-0 order-2 mx-5 mt-5 aspect-[16/9] overflow-hidden bg-[#1a1028] sm:mx-6 md:absolute md:inset-0 md:z-0 md:m-0 md:mt-0 md:aspect-auto"
        aria-hidden
      >
        {/* Poster always present for instant first paint; MP4 layers mount after mediaEnabled. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- exact framing with video object-fit */}
        <img
          src={active.poster}
          alt=""
          className="absolute inset-0 h-full w-full object-contain object-center md:object-cover md:object-[72%_center]"
          decoding="async"
          fetchPriority="high"
          draggable={false}
        />
        {showVideo ? (
          <>
            <HeroVideoLayer
              celebration={slots[0].celebration}
              active={slots[0].active}
              opacity={slots[0].opacity}
              shouldPlay={inView && slots[0].active && slots[0].opacity > 0.05}
              load={slots[0].load || slots[0].active}
              onError={() => setVideoFailed(true)}
            />
            <HeroVideoLayer
              celebration={slots[1].celebration}
              active={slots[1].active}
              opacity={slots[1].opacity}
              shouldPlay={inView && slots[1].active && slots[1].opacity > 0.05}
              load={slots[1].load || slots[1].active}
              onError={() => setVideoFailed(true)}
            />
          </>
        ) : null}

        <div
          aria-hidden
          className="absolute inset-0 z-[1] hidden transition-[background] duration-700 md:block"
          style={{ background: active.theme.veil }}
        />

        {finePointer && !reduced ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[1] hidden mix-blend-soft-light transition-opacity duration-500 md:block"
            style={{
              background: `radial-gradient(42% 38% at ${cursor.x * 100}% ${cursor.y * 100}%, rgb(255 236 210 / 0.28), transparent 70%)`,
            }}
          />
        ) : null}

        <AmbientParticles mode={active.theme.particle} count={finePointer ? 18 : 10} />
      </div>

      {/* 3. Mobile CTA — below video */}
      <div className="relative z-[3] order-3 mt-6 flex justify-center px-5 sm:px-6 md:hidden">
        <HeroCtaButton label={active.cta} />
      </div>

      {/* 4. Celebration selector */}
      <div className="relative z-[3] order-4 mt-5 px-5 pb-8 sm:px-6 md:absolute md:bottom-8 md:left-0 md:mt-0 md:w-[min(46%,36rem)] md:px-8 md:pb-0 lg:w-[min(44%,40rem)] xl:px-12">
        <CelebrationSelector
          activeId={active.id}
          progress={progress}
          onSelect={onSelect}
          reducedMotion={reduced}
          compact
        />
      </div>
    </section>
  );
}
