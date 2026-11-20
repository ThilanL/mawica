import { afterAll, describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { db } from "@/lib/db";
import { createCardSchema } from "@/modules/cards/schema";
import { createCard, getPublishedCard } from "@/modules/cards/service";
import {
  CHRISTMAS_MUSIC_FALLBACK_TEMPLATES,
  HISTORICAL_CHRISTMAS_FALLBACK,
  MUSIC_NONE,
  MUSIC_TRACK_IDS,
  defaultMusicForTemplate,
  formatDuration,
  isMusicTrackId,
  listActiveMusicTracks,
  musicTracks,
  resolveEffectiveMusic,
} from "@/modules/music/catalogue";
import { publishOwnedCard } from "@/modules/wallet/publish";
import { welcomeHash } from "@/modules/wallet/wallet";
import { createSchedule } from "@/modules/scheduling/service";

const users: string[] = [];
const emails: string[] = [];
async function mkUser() {
  const id = crypto.randomUUID();
  const u = { id, email: `${id}@music.example.test`, emailVerified: true };
  await db.user.create({ data: { id, name: "", email: u.email, emailVerified: true } });
  users.push(id); emails.push(u.email);
  return u;
}
const key = (s: string) => s.padEnd(16, "-");

afterAll(async () => {
  const accs = (await db.creditAccount.findMany({ where: { userId: { in: users } }, select: { id: true } })).map((a) => a.id);
  await db.scheduledDelivery.deleteMany({ where: { ownerId: { in: users } } });
  await db.card.deleteMany({ where: { OR: [{ ownerId: { in: users } }, { recipientName: "MusicTest" }] } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL mawica.ledger_purge = 'on'`;
    await tx.$executeRaw`DELETE FROM "LedgerEntry" WHERE "accountId" = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditReservation" WHERE "accountId" = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditGrant" WHERE "accountId" = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditAccount" WHERE id = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "WelcomeGrantTombstone" WHERE "emailHash" = ANY(${emails.map(welcomeHash)})`;
  });
  await db.$disconnect();
});

describe("music catalogue", () => {
  it("exposes stable ids including none, and only active tracks for the wizard", () => {
    expect(MUSIC_TRACK_IDS).toEqual(["rise-and-shine", "snowflakes-and-lights", "snowlight-on-the-sleigh-path", "none"]);
    expect(listActiveMusicTracks().map((t) => t.id)).toEqual(["rise-and-shine", "snowflakes-and-lights", "snowlight-on-the-sleigh-path"]);
    for (const t of listActiveMusicTracks()) {
      expect(t.src).toMatch(/^\/music\/[a-z0-9-]+\.mp3$/);
      expect(t.durationSeconds).toBeGreaterThan(0);
      expect(formatDuration(t.durationSeconds)).toMatch(/^\d+:\d{2}$/);
    }
  });

  it("defaults new Christmas cards to Snowlight and non-Christmas to none", () => {
    for (const k of CHRISTMAS_MUSIC_FALLBACK_TEMPLATES) expect(defaultMusicForTemplate(k)).toBe(HISTORICAL_CHRISTMAS_FALLBACK);
    expect(defaultMusicForTemplate("new-year-2027")).toBe(MUSIC_NONE);
    expect(defaultMusicForTemplate("lumis-wish")).toBe(MUSIC_NONE);
    expect(defaultMusicForTemplate("lumis-wish-cinema")).toBe(MUSIC_NONE);
  });

  it("resolves historical null Christmas to Snowlight, none to silence, unknown to silence", () => {
    expect(resolveEffectiveMusic(null, "snow-globe")).toMatchObject({ source: "historical-christmas", trackId: HISTORICAL_CHRISTMAS_FALLBACK });
    expect(resolveEffectiveMusic(undefined, "christmas-tree").source).toBe("historical-christmas");
    expect(resolveEffectiveMusic(null, "new-year-2027")).toMatchObject({ source: "silent", track: null });
    expect(resolveEffectiveMusic(null, "lumis-wish")).toMatchObject({ source: "silent", track: null });
    expect(resolveEffectiveMusic(MUSIC_NONE, "snow-globe")).toMatchObject({ source: "none", track: null });
    expect(resolveEffectiveMusic("rise-and-shine", "warm-wishes").source).toBe("selected");
    expect(resolveEffectiveMusic("not-a-track", "snow-globe")).toMatchObject({ source: "silent", track: null });
    expect(resolveEffectiveMusic("http://evil.example/x.mp3", "snow-globe").source).toBe("silent");
  });

  it("never treats external URLs as valid track ids", () => {
    expect(isMusicTrackId("https://cdn.example/song.mp3")).toBe(false);
    expect(createCardSchema.safeParse({
      templateKey: "snow-globe", recipientName: "A", senderName: "B", message: "Hi",
      musicTrackId: "https://cdn.example/song.mp3",
    }).success).toBe(false);
  });
});

describe("createCardSchema musicTrackId", () => {
  const base = { templateKey: "snow-globe", recipientName: "Ava", senderName: "Sam", message: "Hello" };
  it("requires a catalogue id and accepts none", () => {
    expect(createCardSchema.safeParse(base).success).toBe(false);
    expect(createCardSchema.safeParse({ ...base, musicTrackId: MUSIC_NONE }).success).toBe(true);
    expect(createCardSchema.safeParse({ ...base, musicTrackId: "rise-and-shine" }).success).toBe(true);
    expect(createCardSchema.safeParse({ ...base, musicTrackId: "bogus" }).success).toBe(false);
  });
});

describe("publish and schedule persist musicTrackId", () => {
  it("stores the selected track on a standard publish and replays with the same fingerprint", async () => {
    const u = await mkUser();
    const input = { templateKey: "snow-globe" as const, recipientName: "MusicTest", senderName: "Sam", message: "Hello", musicTrackId: "rise-and-shine" as const };
    const a = await publishOwnedCard(input, u, { idempotencyKey: key("mus-pub-1") });
    const b = await publishOwnedCard(input, u, { idempotencyKey: key("mus-pub-1") });
    expect(a.slug).toBe(b.slug);
    expect(b.replay).toBe(true);
    const card = await db.card.findUnique({ where: { slug: a.slug } });
    expect(card?.musicTrackId).toBe("rise-and-shine");
    const pub = await getPublishedCard(a.slug);
    expect(resolveEffectiveMusic(pub!.musicTrackId, pub!.templateKey).trackId).toBe("rise-and-shine");
  });

  it("changing music with the same idempotency key is rejected", async () => {
    const u = await mkUser();
    const input = { templateKey: "snow-globe" as const, recipientName: "MusicTest", senderName: "Sam", message: "Hello", musicTrackId: "rise-and-shine" as const };
    await publishOwnedCard(input, u, { idempotencyKey: key("mus-idem-1") });
    await expect(publishOwnedCard({ ...input, musicTrackId: MUSIC_NONE }, u, { idempotencyKey: key("mus-idem-1") })).rejects.toThrow();
  });

  it("stores none explicitly on premium and a selected track on schedule", async () => {
    const uPrem = await mkUser();
    const prem = await publishOwnedCard({
      templateKey: "lumis-wish", recipientName: "MusicTest", senderName: "Sam", message: "Hello", musicTrackId: MUSIC_NONE,
    }, uPrem, { idempotencyKey: key("mus-prem-1") });
    expect((await db.card.findUnique({ where: { slug: prem.slug } }))?.musicTrackId).toBe(MUSIC_NONE);

    const uSched = await mkUser();
    const sched = await createSchedule({
      templateKey: "snow-globe", recipientName: "MusicTest", senderName: "Sam", message: "Later", musicTrackId: "snowflakes-and-lights",
      saveRecipient: false, channel: "LINK", schedule: { localDate: "2026-12-01", localTime: "09:00", timeZone: "UTC" },
    }, uSched, { idempotencyKey: key("mus-sch-1"), now: new Date("2026-11-11T00:00:00.000Z") });
    const row = await db.scheduledDelivery.findUnique({ where: { id: sched.schedule.id }, include: { card: true } });
    expect(row?.card.musicTrackId).toBe("snowflakes-and-lights");
  });

  it("historical null Christmas cards resolve without rewriting the row", async () => {
    const slug = (await createCard({
      templateKey: "special-gift", recipientName: "MusicTest", senderName: "Sam", message: "Hello", musicTrackId: MUSIC_NONE, website: "",
    })).slug;
    // Simulate a legacy row: clear the explicit value back to null without going through the publish path.
    await db.card.update({ where: { slug }, data: { musicTrackId: null } });
    const before = await db.card.findUnique({ where: { slug } });
    expect(before?.musicTrackId).toBeNull();
    const pub = await getPublishedCard(slug);
    const resolved = resolveEffectiveMusic(pub!.musicTrackId, pub!.templateKey);
    expect(resolved.source).toBe("historical-christmas");
    expect(resolved.track?.id).toBe(HISTORICAL_CHRISTMAS_FALLBACK);
    expect((await db.card.findUnique({ where: { slug } }))?.musicTrackId).toBeNull(); // still null in DB
  });
});

describe("wizard draft and player contracts", () => {
  it("persists musicTrackId in the OTP draft and restores it", () => {
    const src = readFileSync("src/components/create/CreateWizard.tsx", "utf8");
    expect(src).toMatch(/musicTrackId/);
    expect(src).toMatch(/MusicField/);
    expect(src).toMatch(/setMusicTrackId\(isMusicTrackId\(d\.musicTrackId\)/);
    expect(src).toMatch(/sessionStorage\.setItem\(DRAFT_KEY[\s\S]*musicTrackId/);
  });

  it("recipient player uses one HTMLAudioElement outside WebGL and fails soft", () => {
    const src = readFileSync("src/components/cards/CardMusicPlayer.tsx", "utf8");
    expect(src).toMatch(/new Audio\(/);
    expect(src).toMatch(/DEFAULT_VOLUME = 0\.45/);
    expect(src).toMatch(/Open your greeting/);
    expect(src).toMatch(/userMutedRef/);
    expect(src).toMatch(/audio\.pause\(\)/);
    expect(src).toMatch(/removeAttribute\("src"\)/);
    const page = readFileSync("src/app/(card)/c/[slug]/page.tsx", "utf8");
    expect(page).toMatch(/CardMusicPlayer/);
    expect(page).toMatch(/resolveEffectiveMusic/);
  });

  it("serves audio/mpeg with a one-hour cache and does not commit binary assets by default", () => {
    const cfg = readFileSync("next.config.ts", "utf8");
    expect(cfg).toMatch(/\/music\/:file\*\.mp3/);
    expect(cfg).toMatch(/audio\/mpeg/);
    expect(cfg).toMatch(/max-age=3600/);
    const ignore = readFileSync(".gitignore", "utf8");
    expect(ignore).toMatch(/public\/music\/\*\.mp3/);
    // Local copies may exist for development; binaries must stay gitignored.
    for (const id of Object.keys(musicTracks)) {
      const path = `public/music/${id}.mp3`;
      if (existsSync(path)) expect(readFileSync(path).length).toBeGreaterThan(1000);
    }
  });
});
