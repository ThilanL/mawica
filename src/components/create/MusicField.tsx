"use client";

import { useEffect, useRef, useState } from "react";
import {
  MUSIC_NONE,
  formatDuration,
  listActiveMusicTracks,
  type MusicTrackId,
} from "@/modules/music/catalogue";

type Props = {
  value: MusicTrackId;
  onChange: (id: MusicTrackId) => void;
};

/** Background music picker for the personalise step. One track or No Music; preview stops on change/unmount. */
export function MusicField({ value, onChange }: Props) {
  const tracks = listActiveMusicTracks();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  function stopPreview() {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
      audioRef.current = null;
    }
    setPlayingId(null);
  }

  useEffect(() => () => { stopPreview(); }, []);

  function select(id: MusicTrackId) {
    stopPreview();
    onChange(id);
  }

  function togglePreview(id: Exclude<MusicTrackId, typeof MUSIC_NONE>, src: string) {
    if (playingId === id) {
      stopPreview();
      return;
    }
    stopPreview();
    const audio = new Audio(src);
    audio.volume = 0.45;
    audioRef.current = audio;
    setPlayingId(id);
    void audio.play().catch(() => {
      stopPreview();
    });
    audio.addEventListener("ended", () => setPlayingId(null), { once: true });
    audio.addEventListener("error", () => stopPreview(), { once: true });
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-midnight">Background music</legend>
      <p className="text-sm text-ink-soft">Choose one soundtrack, or no music. Previewing is free.</p>
      <div role="radiogroup" aria-label="Background music" className="space-y-2">
        {tracks.map((t) => {
          const selected = value === t.id;
          return (
            <div
              key={t.id}
              className={`flex items-center gap-3 rounded-2xl border px-3 py-3 transition ${selected ? "border-lavender bg-white shadow-sm" : "border-midnight/15 bg-white/60"}`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => select(t.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block font-medium text-midnight">{t.title}</span>
                <span className="mt-0.5 block text-xs text-ink-soft">{formatDuration(t.durationSeconds)}</span>
              </button>
              <button
                type="button"
                onClick={() => togglePreview(t.id, t.src)}
                aria-label={playingId === t.id ? `Pause preview of ${t.title}` : `Preview ${t.title}`}
                className="shrink-0 rounded-full bg-midnight/90 px-3 py-1.5 text-xs font-semibold text-ivory hover:bg-midnight"
              >
                {playingId === t.id ? "Pause" : "Play"}
              </button>
            </div>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={value === MUSIC_NONE}
          onClick={() => select(MUSIC_NONE)}
          className={`block w-full rounded-2xl border px-3 py-3 text-left transition ${value === MUSIC_NONE ? "border-lavender bg-white shadow-sm" : "border-midnight/15 bg-white/60"}`}
        >
          <span className="block font-medium text-midnight">No music</span>
          <span className="mt-0.5 block text-xs text-ink-soft">Silent greeting</span>
        </button>
      </div>
    </fieldset>
  );
}
