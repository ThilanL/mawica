"use client";

import { useEffect, useRef, useState } from "react";
import type { MusicTrack } from "@/modules/music/catalogue";

const DEFAULT_VOLUME = 0.45;

type Phase = "idle" | "playing" | "blocked" | "muted" | "ended";

/**
 * Single HTMLAudioElement for a published card. Lives outside WebGL/AR.
 * Remount (via key) when the track changes so local state resets cleanly.
 * Autoplay is attempted; if blocked, "Open your greeting" starts audio after a gesture.
 * Explicit mute is sticky for the visit. Missing audio never blocks the card.
 */
export function CardMusicPlayer({ track }: { track: MusicTrack | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const userMutedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!track) return;

    const audio = new Audio(track.src);
    audio.preload = "auto";
    audio.loop = true;
    audio.volume = DEFAULT_VOLUME;
    audioRef.current = audio;

    const onEnded = () => setPhase("ended");
    const onError = () => setFailed(true);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    let cancelled = false;
    void audio.play().then(() => {
      if (cancelled || userMutedRef.current) return;
      setPhase("playing");
    }).catch(() => {
      if (!cancelled) setPhase("blocked");
    });

    return () => {
      cancelled = true;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [track]);

  if (!track || failed) return null;

  async function startFromGesture() {
    const audio = audioRef.current;
    if (!audio) return;
    userMutedRef.current = false;
    audio.muted = false;
    try {
      await audio.play();
      setPhase("playing");
    } catch {
      setPhase("blocked");
    }
  }

  function toggleMute() {
    const audio = audioRef.current;
    if (!audio) return;
    if (phase === "playing") {
      userMutedRef.current = true;
      audio.pause();
      setPhase("muted");
      return;
    }
    if (phase === "muted" || phase === "ended") {
      userMutedRef.current = false;
      void audio.play().then(() => setPhase("playing")).catch(() => setPhase("blocked"));
    }
  }

  function replay() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    if (userMutedRef.current || phase === "muted") return;
    void audio.play().then(() => setPhase("playing")).catch(() => setPhase("blocked"));
  }

  return (
    <>
      {phase === "blocked" && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-end justify-center bg-gradient-to-t from-midnight/70 via-transparent to-transparent pb-[max(5.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => void startFromGesture()}
            className="pointer-events-auto rounded-full bg-ivory px-7 py-3.5 text-sm font-semibold text-midnight shadow-lift ring-1 ring-midnight/10 transition hover:bg-white focus-visible:outline-offset-4"
          >
            Open your greeting
          </button>
        </div>
      )}
      <div className="pointer-events-none absolute left-3 top-3 z-20 flex gap-2">
        <button
          type="button"
          onClick={toggleMute}
          disabled={phase === "blocked" || phase === "idle"}
          aria-pressed={phase === "muted"}
          aria-label={phase === "muted" ? "Unmute music" : "Mute music"}
          className="pointer-events-auto rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-ivory backdrop-blur ring-1 ring-white/25 hover:bg-white/25 disabled:opacity-40"
        >
          {phase === "muted" ? "Unmute" : "Mute"}
        </button>
        <button
          type="button"
          onClick={replay}
          disabled={phase === "blocked" || phase === "idle"}
          aria-label="Restart music"
          className="pointer-events-auto rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-ivory backdrop-blur ring-1 ring-white/25 hover:bg-white/25 disabled:opacity-40"
        >
          Restart
        </button>
      </div>
    </>
  );
}
