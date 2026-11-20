/**
 * Curated greeting-card soundtracks. IDs are stable and stored on Card.musicTrackId.
 * Audio files live at public/music/<id>.mp3 (not committed until distribution rights are confirmed).
 */
import { getTemplate, isAnyTemplateKey, isTemplateKey } from "@/modules/templates/registry";

export const MUSIC_NONE = "none" as const;

export const MUSIC_TRACK_IDS = [
  "rise-and-shine",
  "snowflakes-and-lights",
  "snowlight-on-the-sleigh-path",
  MUSIC_NONE,
] as const;

export type MusicTrackId = (typeof MUSIC_TRACK_IDS)[number];

export type MusicTrack = {
  id: Exclude<MusicTrackId, typeof MUSIC_NONE>;
  title: string;
  /** Public path under the site origin (never an external streaming URL). */
  src: string;
  durationSeconds: number;
  suggestedOccasions: ReadonlyArray<"Christmas" | "New Year" | "Any occasion">;
  active: boolean;
};

/** Christmas templates that receive the historical null → Snowlight fallback at read time. */
export const CHRISTMAS_MUSIC_FALLBACK_TEMPLATES = [
  "snow-globe",
  "christmas-tree",
  "special-gift",
  "warm-wishes",
] as const;

export const HISTORICAL_CHRISTMAS_FALLBACK: MusicTrackId = "snowlight-on-the-sleigh-path";

export const musicTracks: Record<Exclude<MusicTrackId, typeof MUSIC_NONE>, MusicTrack> = {
  "rise-and-shine": {
    id: "rise-and-shine",
    title: "Rise and Shine",
    src: "/music/rise-and-shine.mp3",
    durationSeconds: 179,
    suggestedOccasions: ["Christmas", "New Year", "Any occasion"],
    active: true,
  },
  "snowflakes-and-lights": {
    id: "snowflakes-and-lights",
    title: "Snowflakes and Lights",
    src: "/music/snowflakes-and-lights.mp3",
    durationSeconds: 155,
    suggestedOccasions: ["Christmas"],
    active: true,
  },
  "snowlight-on-the-sleigh-path": {
    id: "snowlight-on-the-sleigh-path",
    title: "Snowlight on the Sleigh Path",
    src: "/music/snowlight-on-the-sleigh-path.mp3",
    durationSeconds: 200,
    suggestedOccasions: ["Christmas"],
    active: true,
  },
};

export const isMusicTrackId = (v: unknown): v is MusicTrackId =>
  typeof v === "string" && (MUSIC_TRACK_IDS as readonly string[]).includes(v);

/** Active catalogue entries for the wizard (excludes none). */
export function listActiveMusicTracks(): MusicTrack[] {
  return Object.values(musicTracks).filter((t) => t.active);
}

export function getMusicTrack(id: string): MusicTrack | null {
  if (!isMusicTrackId(id) || id === MUSIC_NONE) return null;
  const t = musicTracks[id];
  return t?.active ? t : null;
}

/** Wizard default when the user has not chosen yet (never null — new cards always persist an explicit id). */
export function defaultMusicForTemplate(templateKey: string): MusicTrackId {
  if (!isAnyTemplateKey(templateKey)) return MUSIC_NONE;
  if (isTemplateKey(templateKey) && getTemplate(templateKey).occasion === "Christmas") {
    return HISTORICAL_CHRISTMAS_FALLBACK;
  }
  return MUSIC_NONE;
}

/**
 * Read-time resolver for playback. Distinguishes:
 * - explicit "none" → silence
 * - valid active id → that track
 * - null (legacy unset) + Christmas template → Snowlight fallback
 * - null + non-Christmas / unknown / inactive → silence
 * Does not write to the database.
 */
export function resolveEffectiveMusic(
  musicTrackId: string | null | undefined,
  templateKey: string,
): { trackId: MusicTrackId | null; track: MusicTrack | null; source: "selected" | "none" | "historical-christmas" | "silent" } {
  if (musicTrackId === MUSIC_NONE) {
    return { trackId: MUSIC_NONE, track: null, source: "none" };
  }
  if (typeof musicTrackId === "string" && musicTrackId.length > 0) {
    const track = getMusicTrack(musicTrackId);
    if (track) return { trackId: track.id, track, source: "selected" };
    return { trackId: null, track: null, source: "silent" };
  }
  // Legacy null / undefined
  if ((CHRISTMAS_MUSIC_FALLBACK_TEMPLATES as readonly string[]).includes(templateKey)) {
    const track = getMusicTrack(HISTORICAL_CHRISTMAS_FALLBACK);
    return { trackId: HISTORICAL_CHRISTMAS_FALLBACK, track, source: "historical-christmas" };
  }
  return { trackId: null, track: null, source: "silent" };
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
