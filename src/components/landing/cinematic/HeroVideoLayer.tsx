"use client";

import { useEffect, useRef, useState } from "react";
import type { Celebration } from "@/content/celebrations";

type Props = {
  celebration: Celebration;
  /** When true, this layer is the visible (or fading-in) video. */
  active: boolean;
  /** Crossfade opacity 0–1 for this layer. */
  opacity: number;
  /** Whether the hero is in the viewport and should play. */
  shouldPlay: boolean;
  /** Prefetch / attach src before this layer becomes active. */
  load: boolean;
  onReady?: () => void;
  onError?: () => void;
};

/**
 * Single muted inline video slot. Two instances stack for cinematic crossfades.
 * Poster paints immediately; the MP4 is attached only when `load` is true
 * (deferred by CinematicHero so mobile first paint is not blocked by ~4MB clips).
 * Mobile: object-contain (full globe). Desktop: object-cover (cinematic crop).
 */
export function HeroVideoLayer({
  celebration,
  active,
  opacity,
  shouldPlay,
  load,
  onReady,
  onError,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const readyFor = useRef<string | null>(null);
  const [playingReady, setPlayingReady] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    if (!load) {
      if (v.dataset.src) {
        v.pause();
        v.removeAttribute("src");
        v.load();
        delete v.dataset.src;
        readyFor.current = null;
        setPlayingReady(false);
      }
      return;
    }

    const onCanPlay = () => {
      readyFor.current = celebration.video;
      setPlayingReady(true);
      onReady?.();
    };
    const onFail = () => onError?.();

    if (v.dataset.src !== celebration.video) {
      v.dataset.src = celebration.video;
      v.poster = celebration.poster;
      v.src = celebration.video;
      v.load();
      readyFor.current = null;
      setPlayingReady(false);
    }

    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("error", onFail);
    return () => {
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("error", onFail);
    };
  }, [celebration.video, celebration.poster, load, onReady, onError]);

  useEffect(() => {
    const v = ref.current;
    if (!v || !load) return;

    if (shouldPlay && active) {
      v.loop = true;
      const play = v.play();
      if (play && typeof play.catch === "function") play.catch(() => undefined);
    } else {
      v.pause();
    }
  }, [shouldPlay, active, load, celebration.video]);

  const frameClass =
    "pointer-events-none absolute inset-0 h-full w-full object-contain object-center md:object-cover md:object-[72%_center]";

  return (
    <div className="absolute inset-0" style={{ opacity, transition: "opacity 1.2s ease-in-out" }} aria-hidden={!active}>
      {/* Poster is the LCP/first-paint surface (~100KB). Video fades in once buffered. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- exact framing with video object-fit */}
      <img
        src={celebration.poster}
        alt=""
        className={frameClass}
        decoding="async"
        fetchPriority={active ? "high" : "low"}
        draggable={false}
      />
      <video
        ref={ref}
        className={frameClass}
        style={{ opacity: playingReady ? 1 : 0, transition: "opacity 0.45s ease" }}
        muted
        playsInline
        // Never "auto" — christmas.mp4 alone is ~3.9MB and stalls mobile first load.
        preload={load ? "metadata" : "none"}
        poster={celebration.poster}
        tabIndex={-1}
        disablePictureInPicture
        disableRemotePlayback
      />
    </div>
  );
}
