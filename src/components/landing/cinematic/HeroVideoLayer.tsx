"use client";

import { useEffect, useRef } from "react";
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

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    if (!load) {
      if (!active && v.dataset.src) {
        v.pause();
        v.removeAttribute("src");
        v.load();
        delete v.dataset.src;
        readyFor.current = null;
      }
      return;
    }

    const onCanPlay = () => {
      readyFor.current = celebration.video;
      onReady?.();
    };
    const onFail = () => onError?.();

    if (v.dataset.src !== celebration.video) {
      v.dataset.src = celebration.video;
      v.poster = celebration.poster;
      v.src = celebration.video;
      v.load();
      readyFor.current = null;
    }

    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("error", onFail);
    return () => {
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("error", onFail);
    };
  }, [celebration.video, celebration.poster, load, active, onReady, onError]);

  useEffect(() => {
    const v = ref.current;
    if (!v || !load) return;

    if (shouldPlay && active) {
      v.loop = true;
      const play = v.play();
      if (play && typeof play.catch === "function") play.catch(() => undefined);
    } else if (!active) {
      v.pause();
    } else {
      v.pause();
    }
  }, [shouldPlay, active, load, celebration.video]);

  return (
    <video
      ref={ref}
      className="pointer-events-none absolute inset-0 h-full w-full object-contain object-center md:object-cover md:object-[72%_center]"
      style={{ opacity, transition: "opacity 1.2s ease-in-out" }}
      muted
      playsInline
      preload={load ? (active ? "auto" : "metadata") : "none"}
      poster={celebration.poster}
      aria-hidden={!active}
      tabIndex={-1}
      disablePictureInPicture
      disableRemotePlayback
    />
  );
}
