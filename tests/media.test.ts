import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { db } from "@/lib/db";
import { MEDIA_LIMITS, VIDEO_POLICY } from "@/modules/media/limits";
import { sniffImage, validateUpload, MediaError } from "@/modules/media/validate";
import { processImage } from "@/modules/media/process";
import { attachMedia, deleteOwnPending, purgeOrphanMedia, readMedia, uploadPhoto } from "@/modules/media/service";
import { publishOwnedCard } from "@/modules/wallet/publish";
import { balances } from "@/modules/wallet/engine";
import { welcomeHash } from "@/modules/wallet/wallet";
import { cancelSchedule, createSchedule, listSchedules } from "@/modules/scheduling/service";
import { getPublishedCard, removeCard } from "@/modules/cards/service";
import { runOnce } from "@/modules/delivery/queue";
import { DEFAULT_POLICY } from "@/modules/delivery/config";

// The session helper is mocked so the routes can be exercised as different signed-in users (real sessions: scripts/*-e2e).
const session = vi.hoisted(() => ({ user: null as null | { id: string; email: string; emailVerified: boolean } }));
vi.mock("@/modules/auth/session", () => ({ getRequestUser: async () => session.user, getSessionUser: async () => session.user }));

import { POST as uploadRoute } from "@/app/api/media/route";
import { GET as getMediaRoute, DELETE as deleteMediaRoute } from "@/app/api/media/[id]/route";
import { POST as publishRoute } from "@/app/api/cards/route";

const users: string[] = [];
const emails: string[] = [];
const cinema = "lumis-wish-cinema";
const COOKIE = "mawica.session_token=x.y";
let n = 0;
const ip = () => `198.51.100.${(++n % 240) + 1}`;
async function mkUser() {
  const id = crypto.randomUUID();
  const u = { id, email: `${id}@media.example.test`, emailVerified: true };
  await db.user.create({ data: { id, name: "", email: u.email, emailVerified: true } });
  users.push(id); emails.push(u.email);
  return u;
}
type User = Awaited<ReturnType<typeof mkUser>>;

const photo = (w = 640, h = 480, fmt: "jpeg" | "png" | "webp" = "jpeg") =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 160 } } })[fmt]().toBuffer();
const up = (u: User, bytes: Buffer, type: string | null = "image/jpeg") => uploadPhoto(u, { contentType: type, bytes, ip: ip() });
const cardInput = (mediaId?: string, templateKey: string = cinema) => ({ templateKey: templateKey as never, recipientName: "MediaTest", senderName: "Sam", message: "Hello there", musicTrackId: "none" as const, ...(mediaId ? { mediaId } : {}) });
const publish = (u: User, mediaId?: string, key = crypto.randomUUID(), templateKey: string = cinema) => publishOwnedCard(cardInput(mediaId, templateKey), u, { idempotencyKey: key });
const rejects = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as MediaError);

beforeAll(async () => { await db.scheduledDelivery.deleteMany(); });
beforeEach(async () => { await db.rateLimit.deleteMany(); session.user = null; });
afterAll(async () => {
  const accs = (await db.creditAccount.findMany({ where: { userId: { in: users } }, select: { id: true } })).map((a) => a.id);
  await db.scheduledDelivery.deleteMany({ where: { ownerId: { in: users } } });
  await db.card.deleteMany({ where: { ownerId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL mawica.ledger_purge = 'on'`;
    await tx.$executeRaw`DELETE FROM "LedgerEntry" WHERE "accountId" = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditReservation" WHERE "accountId" = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditGrant" WHERE "accountId" = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditAccount" WHERE id = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "WelcomeGrantTombstone" WHERE "emailHash" = ANY(${emails.map(welcomeHash)})`;
  });
  await db.rateLimit.deleteMany();
  await db.$disconnect();
});

describe("media validation: type comes from the bytes", () => {
  it("recognises JPEG, PNG and WebP by magic bytes only", async () => {
    expect(sniffImage(await photo(32, 32, "jpeg"))).toBe("jpeg");
    expect(sniffImage(await photo(32, 32, "png"))).toBe("png");
    expect(sniffImage(await photo(32, 32, "webp"))).toBe("webp");
  });
  it("refuses SVG, GIF, HTML, PDF and executables even when they claim to be images", () => {
    for (const body of ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "GIF89a....", "<html><script>1</script>", "%PDF-1.7", "MZ\u0090\u0000"]) {
      const b = Buffer.from(body);
      expect(sniffImage(b)).toBe("other");
      expect((() => { try { validateUpload("image/png", b); return null; } catch (e) { return e as MediaError; } })()?.code).toBe("UNSUPPORTED_TYPE");
    }
  });
  it("refuses a declared type that disagrees with the bytes, and empty or oversized bodies", async () => {
    const jpeg = await photo(32, 32, "jpeg");
    expect(() => validateUpload("image/png", jpeg)).toThrow(/isn't the type/);
    expect(() => validateUpload(null, jpeg)).toThrow();
    expect(() => validateUpload("image/jpeg", Buffer.alloc(0))).toThrow(/empty/);
    const big = Buffer.concat([jpeg.subarray(0, 3), Buffer.alloc(MEDIA_LIMITS.maxUploadBytes)]);
    expect((() => { try { validateUpload("image/jpeg", big); return null; } catch (e) { return e as MediaError; } })()).toMatchObject({ code: "TOO_LARGE", status: 413 });
  });
  it("video is refused with a clear message: it is not enabled", async () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(40)]);
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(40)]);
    for (const [b, t] of [[mp4, "video/mp4"], [webm, "video/webm"], [await photo(32, 32), "video/mp4"]] as const) {
      expect((() => { try { validateUpload(t, b); return null; } catch (e) { return e as MediaError; } })()).toMatchObject({ code: "VIDEO_UNAVAILABLE", status: 415 });
    }
    expect(VIDEO_POLICY.enabled).toBe(false);
    expect(VIDEO_POLICY.maxSeconds).toBe(5);
    expect(VIDEO_POLICY.maxHeight).toBe(720);
    expect(VIDEO_POLICY.blocker).toMatch(/ffmpeg/);
  });
});

describe("media processing: a fresh, small, metadata-free WebP", () => {
  it("strips EXIF (including a private caption) and applies the orientation", async () => {
    const src = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#c47" } })
      .withExif({ IFD0: { ImageDescription: "PRIVATE-HOME-ADDRESS", Copyright: "SECRET-OWNER" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect(src.includes(Buffer.from("PRIVATE-HOME-ADDRESS"))).toBe(true); // the input really carries it
    const out = await processImage(src);
    expect(out.data.includes(Buffer.from("PRIVATE-HOME-ADDRESS"))).toBe(false);
    expect(out.data.includes(Buffer.from("SECRET-OWNER"))).toBe(false);
    const m = await sharp(out.data).metadata();
    expect(m.format).toBe("webp");
    expect(m.exif).toBeUndefined(); expect(m.icc).toBeUndefined(); expect(m.xmp).toBeUndefined();
    expect([out.width, out.height]).toEqual([400, 800]); // orientation 6 rotated 800x400 into 400x800
  });
  it("shrinks big photos to <= 1280 px and <= 500 KB, preserving the aspect ratio", async () => {
    const w = 2400, h = 1800;
    const noise = await sharp(randomBytes(w * h * 3), { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 80 }).toBuffer();
    expect(noise.length).toBeGreaterThan(MEDIA_LIMITS.targetBytes * 4);
    const out = await processImage(noise);
    expect(out.data.length).toBeLessThanOrEqual(MEDIA_LIMITS.targetBytes);
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(MEDIA_LIMITS.maxEdge);
    expect(out.width / out.height).toBeCloseTo(4 / 3, 1);
  });
  it("never enlarges a small photo, and keeps PNG transparency", async () => {
    const png = await sharp({ create: { width: 120, height: 90, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
    const out = await processImage(png);
    expect([out.width, out.height]).toEqual([120, 90]);
    expect((await sharp(out.data).metadata()).hasAlpha).toBe(true);
  });
  it("a JPEG with a script appended after the image data comes out clean (polyglot payload is gone)", async () => {
    const jpeg = await photo(300, 200);
    const evil = Buffer.concat([jpeg, Buffer.from("<script>alert('MAWICA_PAYLOAD')</script>")]);
    const out = await processImage(evil);
    expect(out.data.includes(Buffer.from("MAWICA_PAYLOAD"))).toBe(false);
    expect(sniffImage(out.data)).toBe("webp");
  });
  it("rejects truncated files, animated images, tiny images and decompression bombs", async () => {
    const jpeg = await sharp(randomBytes(500 * 400 * 3), { raw: { width: 500, height: 400, channels: 3 } }).jpeg().toBuffer();
    expect((await rejects(processImage(jpeg.subarray(0, Math.floor(jpeg.length / 3)))))?.code).toBe("CORRUPT");
    const w = 64, h = 64, frames = 3;
    const raw = Buffer.alloc(w * h * frames * 4, 255);
    for (let f = 0; f < frames; f++) for (let i = 0; i < w * h; i++) { raw[(f * w * h + i) * 4] = f * 90; raw[(f * w * h + i) * 4 + 1] = 40 + f * 50; } // frames must differ or the encoder merges them
    const anim = await sharp(raw, { raw: { width: w, height: h * frames, channels: 4, pageHeight: h } }).webp({ loop: 0, delay: [100, 100, 100] }).toBuffer();
    expect((await rejects(processImage(anim)))?.code).toBe("ANIMATED");
    expect((await rejects(processImage(await photo(8, 8))))?.code).toBe("TOO_SMALL");
    const bomb = await sharp({ create: { width: 7000, height: 7000, channels: 3, background: "#fff" } }).png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.length).toBeLessThan(MEDIA_LIMITS.maxUploadBytes); // small file, 49 million pixels
    expect(await rejects(processImage(bomb))).toBeInstanceOf(MediaError);
  }, 60000);
});

describe("uploads: ownership, quotas, failures", () => {
  it("stores a private, unattached, re-encoded photo for the owner", async () => {
    const u = await mkUser();
    const m = await up(u, await photo(900, 600));
    const row = await db.cardMedia.findUniqueOrThrow({ where: { id: m.id }, include: { blob: true } });
    expect(row).toMatchObject({ ownerId: u.id, cardId: null, contentType: "image/webp", kind: "IMAGE" });
    expect(row.byteSize).toBe(row.blob!.data.length);
    expect(row.byteSize).toBeLessThanOrEqual(MEDIA_LIMITS.targetBytes);
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("the database refuses malformed rows even if application code had a bug", async () => {
    const u = await mkUser();
    const bad = (extra: Record<string, unknown>) => db.cardMedia.create({ data: { ownerId: u.id, contentType: "image/webp", width: 100, height: 100, byteSize: 1000, sha256: "a".repeat(64), ...extra } as never });
    await expect(bad({ contentType: "image/svg+xml" })).rejects.toThrow();
    await expect(bad({ byteSize: 700_000 })).rejects.toThrow();
    await expect(bad({ width: 9000 })).rejects.toThrow();
    await expect(bad({ sha256: "nothex" })).rejects.toThrow();
  });
  it("failed uploads leave nothing behind and do not use up the pending allowance", async () => {
    const u = await mkUser();
    for (const [bytes, type] of [[Buffer.from("not an image"), "image/jpeg"], [await photo(64, 64, "png"), "image/jpeg"], [Buffer.alloc(0), "image/png"]] as const) expect(await rejects(up(u, bytes, type))).toBeInstanceOf(MediaError);
    expect(await db.cardMedia.count({ where: { ownerId: u.id } })).toBe(0);
    expect(await db.cardMediaBlob.count({ where: { media: { ownerId: u.id } } })).toBe(0);
  });
  it("caps unclaimed uploads per account; removing one frees a slot", async () => {
    const u = await mkUser();
    const ids: string[] = [];
    for (let i = 0; i < MEDIA_LIMITS.maxPendingPerUser; i++) ids.push((await up(u, await photo(100 + i, 100))).id);
    expect((await rejects(up(u, await photo(200, 100))))?.code).toBe("TOO_MANY_PENDING");
    expect(await deleteOwnPending(u, ids[0])).toBe(true);
    expect((await up(u, await photo(210, 100))).id).toBeTruthy();
  });
  it("rate-limits uploads per account per hour, with a retry hint", async () => {
    const u = await mkUser();
    const buf = await photo(100, 100);
    for (let i = 0; i < MEDIA_LIMITS.maxUploadsPerHour; i++) { const m = await up(u, buf); await deleteOwnPending(u, m.id); }
    const e = await rejects(up(u, buf));
    expect(e).toMatchObject({ code: "RATE_LIMITED", status: 429 });
    expect(e?.retryAfterSeconds).toBeGreaterThan(0);
  });
  it("only the owner can remove an unclaimed photo; a claimed photo cannot be removed directly", async () => {
    const [a, b] = [await mkUser(), await mkUser()];
    const m = await up(a, await photo(100, 100));
    expect(await deleteOwnPending(b, m.id)).toBe(false);
    expect(await db.cardMedia.count({ where: { id: m.id } })).toBe(1);
    await publish(a, m.id);
    expect(await deleteOwnPending(a, m.id)).toBe(false);
    expect(await db.cardMedia.count({ where: { id: m.id } })).toBe(1);
  });
});

describe("privacy before and after publication", () => {
  it("an unclaimed photo is readable by its owner only", async () => {
    const [a, b] = [await mkUser(), await mkUser()];
    const m = await up(a, await photo(100, 100));
    expect((await readMedia(m.id, a))?.contentType).toBe("image/webp");
    expect(await readMedia(m.id, b)).toBeNull();
    expect(await readMedia(m.id, null)).toBeNull();
    expect(await readMedia("not-a-uuid", a)).toBeNull();
    expect(await readMedia(crypto.randomUUID(), a)).toBeNull();
  });
  it("publishing attaches the photo in the same transaction as the credit spend, and only then is it public", async () => {
    const u = await mkUser();
    const m = await up(u, await photo(500, 500));
    const out = await publish(u, m.id);
    expect(out.replay).toBe(false);
    const acc = await db.creditAccount.findUniqueOrThrow({ where: { userId: u.id } });
    const b = await db.$transaction((tx) => balances(tx, acc.id, new Date()));
    expect(b.premium).toBe(0); // the one welcome premium credit was spent, once
    const card = await getPublishedCard(out.slug);
    expect(card?.media).toMatchObject({ id: m.id });
    expect((await readMedia(m.id, null))?.public).toBe(true); // anyone, now that the card is PUBLISHED
    expect((await db.cardMedia.findUniqueOrThrow({ where: { id: m.id } })).attachedAt).not.toBeNull();
  });
  it("a stranger's photo, a used photo and a template that cannot carry a photo all roll the whole publish back (no card, no credit spent)", async () => {
    const [a, b] = [await mkUser(), await mkUser()];
    const mine = await up(a, await photo(100, 100));
    const before = async (u: User) => { const acc = await db.creditAccount.findUnique({ where: { userId: u.id } }); return acc ? (await db.$transaction((tx) => balances(tx, acc.id, new Date()))).total : null; };
    // someone else's photo
    expect((await rejects(publish(b, mine.id)))?.code).toBe("NOT_AVAILABLE");
    expect(await db.card.count({ where: { ownerId: b.id } })).toBe(0);
    expect(await db.creditReservation.count({ where: { account: { userId: b.id } } })).toBe(0);
    // a template without photo support
    expect((await rejects(publish(a, mine.id, undefined, "lumis-wish")))?.code).toBe("NOT_ALLOWED_FOR_TEMPLATE");
    expect((await rejects(publish(a, mine.id, undefined, "snow-globe")))?.code).toBe("NOT_ALLOWED_FOR_TEMPLATE");
    expect(await db.card.count({ where: { ownerId: a.id } })).toBe(0);
    expect(await before(a)).toBeNull(); // the rollback also undid the wallet's first-use creation: nothing deducted, nothing granted
    // a photo already claimed by another card cannot be claimed again
    const ok = await publish(a, mine.id);
    expect(ok.slug).toBeTruthy();
    const other = await db.card.create({ data: { slug: `t${Date.now().toString(36)}`.slice(0, 12).padEnd(12, "x"), templateKey: cinema, recipientName: "MediaTest", senderName: "S", message: "m", ownerId: a.id, tier: "PREMIUM" } });
    const claim = db.$transaction((tx) => attachMedia(tx, { mediaId: mine.id, ownerId: a.id, cardId: other.id, templateKey: cinema })).then(() => null, (e: unknown) => e as MediaError);
    expect((await claim)?.code).toBe("NOT_AVAILABLE");
  });
  it("a replayed publish (same Idempotency-Key) returns the same card and the photo stays attached once", async () => {
    const u = await mkUser();
    const m = await up(u, await photo(100, 100));
    const key = crypto.randomUUID();
    const first = await publish(u, m.id, key);
    const second = await publish(u, m.id, key);
    expect(second).toMatchObject({ slug: first.slug, replay: true });
    expect(await db.cardMedia.count({ where: { id: m.id, card: { slug: first.slug } } })).toBe(1);
  });
  it("two simultaneous publishes claiming one photo: exactly one wins", async () => {
    const u = await mkUser();
    const m = await up(u, await photo(100, 100));
    const res = await Promise.allSettled([publish(u, m.id), publish(u, m.id)]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.cardMedia.count({ where: { id: m.id, cardId: { not: null } } })).toBe(1);
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(1);
  });
  it("a card without a photo is unchanged (media is null) and the standard cards cannot carry one", async () => {
    const u = await mkUser();
    const out = await publish(u);
    expect((await getPublishedCard(out.slug))?.media).toBeNull();
  });
  it("moderation removal hides the photo from everyone, owner included", async () => {
    const u = await mkUser();
    const m = await up(u, await photo(100, 100));
    const { slug } = await publish(u, m.id);
    expect(await readMedia(m.id, null)).not.toBeNull();
    expect(await removeCard(slug, "test")).toBe(true);
    expect(await readMedia(m.id, null)).toBeNull();
    expect(await readMedia(m.id, u)).toBeNull();
  });
});

describe("scheduled cards keep their photo private until published", () => {
  const T0 = new Date("2026-11-11T00:00:00.000Z");
  const DUE = new Date("2026-11-15T09:00:30.000Z");
  const sched = (u: User, mediaId?: string) => createSchedule({ ...cardInput(mediaId), saveRecipient: false, channel: "LINK", schedule: { localDate: "2026-11-15", localTime: "09:00", timeZone: "UTC" } } as never, u, { idempotencyKey: `${crypto.randomUUID()}`.slice(0, 32), now: T0 });
  const policy = { ...DEFAULT_POLICY, batchSize: 100, jitter: 0 };

  it("scheduled: public 404, owner can preview, then the delivery worker publishes and the photo goes public", async () => {
    const u = await mkUser();
    const m = await up(u, await photo(300, 200));
    const r = await sched(u, m.id);
    expect(r.schedule.card.media).toMatchObject({ src: `/api/media/${m.id}` });
    expect(await db.card.findFirstOrThrow({ where: { scheduledDelivery: { id: r.schedule.id } } })).toMatchObject({ status: "SCHEDULED" });
    expect(await readMedia(m.id, null)).toBeNull(); // not public while scheduled
    expect(await readMedia(m.id, await mkUser())).toBeNull();
    expect((await readMedia(m.id, u))?.public).toBe(false); // owner preview
    const stats = await runOnce({ policy, clock: () => DUE, workerId: "media-test" });
    expect(stats.published).toBeGreaterThanOrEqual(1);
    expect((await readMedia(m.id, null))?.public).toBe(true); // published: now public
  });
  it("a failed attach rolls the reservation back too (no schedule, no credit held)", async () => {
    const [a, b] = [await mkUser(), await mkUser()];
    const m = await up(a, await photo(100, 100));
    const e = await rejects(sched(b, m.id));
    expect(e?.code).toBe("NOT_AVAILABLE");
    expect(await db.scheduledDelivery.count({ where: { ownerId: b.id } })).toBe(0);
    expect(await db.creditReservation.count({ where: { account: { userId: b.id } } })).toBe(0);
  });
  it("cancelling a scheduled card keeps the photo private and it is purged after the grace period", async () => {
    const u = await mkUser();
    const m = await up(u, await photo(100, 100));
    const r = await sched(u, m.id);
    await cancelSchedule(u, r.schedule.id, T0);
    // The purge below uses the real clock, so cancel "now" in the database too (T0 is a fixed date that ages out of the grace period).
    await db.scheduledDelivery.updateMany({ where: { id: r.schedule.id }, data: { cancelledAt: new Date() } });
    expect(await readMedia(m.id, null)).toBeNull();
    expect(await purgeOrphanMedia(new Date())).toMatchObject({ cancelled: expect.any(Number) });
    expect(await db.cardMedia.count({ where: { id: m.id } })).toBe(1); // not yet: inside the grace period
    await db.scheduledDelivery.updateMany({ where: { id: r.schedule.id }, data: { cancelledAt: new Date(Date.now() - 48 * 3_600_000) } });
    const out = await purgeOrphanMedia(new Date());
    expect(out.cancelled).toBeGreaterThanOrEqual(1);
    expect(await db.cardMedia.count({ where: { id: m.id } })).toBe(0);
    expect(await db.cardMediaBlob.count({ where: { mediaId: m.id } })).toBe(0); // bytes go with it
    void listSchedules;
  });
});

describe("orphan cleanup", () => {
  it("deletes unclaimed uploads past 24 hours, keeps recent and attached ones, and removes the bytes", async () => {
    const u = await mkUser();
    const old = await up(u, await photo(100, 100));
    const fresh = await up(u, await photo(110, 100));
    const claimed = await up(u, await photo(120, 100));
    await publish(u, claimed.id);
    await db.cardMedia.updateMany({ where: { id: { in: [old.id, claimed.id] } }, data: { createdAt: new Date(Date.now() - 72 * 3_600_000) } });
    const out = await purgeOrphanMedia(new Date());
    expect(out.orphans).toBeGreaterThanOrEqual(1);
    expect(await db.cardMedia.count({ where: { id: old.id } })).toBe(0);
    expect(await db.cardMediaBlob.count({ where: { mediaId: old.id } })).toBe(0);
    expect(await db.cardMedia.count({ where: { id: fresh.id } })).toBe(1);
    expect(await db.cardMedia.count({ where: { id: claimed.id } })).toBe(1);
  });
  it("deleting an account deletes its photos", async () => {
    const u = await mkUser();
    const m = await up(u, await photo(100, 100));
    await db.user.delete({ where: { id: u.id } });
    expect(await db.cardMedia.count({ where: { id: m.id } })).toBe(0);
    expect(await db.cardMediaBlob.count({ where: { mediaId: m.id } })).toBe(0);
  });
});

describe("HTTP routes", () => {
  const post = (body: BodyInit | null, o: { type?: string; origin?: string | null; cookie?: boolean; len?: number } = {}) =>
    uploadRoute(new Request("http://localhost:3000/api/media", {
      method: "POST", body,
      headers: { "content-type": o.type ?? "image/jpeg", "x-forwarded-for": `1.1.1.1, ${ip()}`, ...(o.origin === null ? {} : { origin: o.origin ?? "http://localhost:3000" }), ...(o.cookie === false ? {} : { cookie: COOKIE }), ...(o.len !== undefined ? { "content-length": String(o.len) } : {}) },
      duplex: "half",
    } as RequestInit));
  const getM = (id: string, o: { cookie?: boolean; inm?: string } = {}) => getMediaRoute(new Request(`http://localhost:3000/api/media/${id}`, { headers: { ...(o.cookie ? { cookie: COOKIE } : {}), ...(o.inm ? { "if-none-match": o.inm } : {}) } }), { params: Promise.resolve({ id }) });

  it("upload requires sign-in, a same-origin request, an image type and a sane size", async () => {
    const jpeg = await photo(200, 200);
    expect((await post(new Uint8Array(jpeg))).status).toBe(401); // no session
    const u = await mkUser(); session.user = u;
    expect((await post(new Uint8Array(jpeg), { origin: null })).status).toBe(403);
    expect((await post(new Uint8Array(jpeg), { origin: "https://evil.example" })).status).toBe(403);
    expect((await post(new Uint8Array(jpeg), { type: "text/html" })).status).toBe(415);
    expect((await post(new Uint8Array(jpeg), { len: MEDIA_LIMITS.maxUploadBytes + 1 })).status).toBe(413);
    const ok = await post(new Uint8Array(jpeg));
    expect(ok.status).toBe(201);
    const j = await ok.json();
    expect(Object.keys(j).sort()).toEqual(["byteSize", "height", "id", "width"]);
    expect(ok.headers.get("cache-control")).toBe("no-store");
  });
  it("an oversized streamed body is cut off without being read in full", async () => {
    const u = await mkUser(); session.user = u;
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const stream = new ReadableStream({ pull(c) { sent++; if (sent > 40) c.close(); else c.enqueue(chunk); } });
    const r = await post(stream as unknown as BodyInit);
    expect(r.status).toBe(413);
    expect(sent).toBeLessThan(20); // stopped reading soon after the 8 MB limit
  });
  it("video upload is refused with 415 and a plain-language message", async () => {
    const u = await mkUser(); session.user = u;
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(100)]);
    const r = await post(new Uint8Array(mp4), { type: "video/mp4" });
    expect(r.status).toBe(415);
    expect((await r.json()).code).toBe("VIDEO_UNAVAILABLE");
  });
  it("serving: private photos give an anonymous caller the same 404 as a missing id; published photos carry safe headers and revalidate", async () => {
    const u = await mkUser(); session.user = u;
    const m = await uploadPhoto(u, { contentType: "image/png", bytes: await photo(300, 200, "png"), ip: ip() });
    const anonPrivate = await getM(m.id);
    const missing = await getM(crypto.randomUUID());
    expect([anonPrivate.status, missing.status]).toEqual([404, 404]);
    expect(await anonPrivate.text()).toBe(await missing.text());
    const owner = await getM(m.id, { cookie: true });
    expect(owner.status).toBe(200);
    expect(owner.headers.get("cache-control")).toBe("private, no-store");
    await publish(u, m.id);
    session.user = null;
    const pub = await getM(m.id);
    expect(pub.status).toBe(200);
    expect(pub.headers.get("content-type")).toBe("image/webp");
    expect(pub.headers.get("x-content-type-options")).toBe("nosniff");
    expect(pub.headers.get("content-security-policy")).toContain("sandbox");
    expect(pub.headers.get("cache-control")).toBe("public, no-cache");
    const etag = pub.headers.get("etag")!;
    expect((await getM(m.id, { inm: etag })).status).toBe(304);
    expect(sniffImage(new Uint8Array(await pub.arrayBuffer()))).toBe("webp");
  });
  it("the owner can delete an unclaimed photo through the API; others get 404", async () => {
    const [a, b] = [await mkUser(), await mkUser()];
    const m = await up(a, await photo(100, 100));
    const del = (u: User | null) => { session.user = u; return deleteMediaRoute(new Request(`http://localhost:3000/api/media/${m.id}`, { method: "DELETE", headers: { origin: "http://localhost:3000", cookie: COOKIE } }), { params: Promise.resolve({ id: m.id }) }); };
    expect((await del(null)).status).toBe(401);
    expect((await del(b)).status).toBe(404);
    expect((await del(a)).status).toBe(204);
    expect(await db.cardMedia.count({ where: { id: m.id } })).toBe(0);
  });
  it("publishing through /api/cards: guests cannot send a photo; a signed-in owner can, once", async () => {
    const u = await mkUser();
    const m = await up(u, await photo(100, 100));
    const body = { templateKey: cinema, recipientName: "MediaTest", senderName: "Sam", message: "Hi", musicTrackId: "none", mediaId: m.id };
    const send = (cookie: boolean, key: string) => publishRoute(new Request("http://localhost:3000/api/cards", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "idempotency-key": key,
        "x-forwarded-for": `1.1.1.1, ${ip()}`,
        ...(cookie ? { cookie: COOKIE } : {}),
      },
      body: JSON.stringify(body),
    }));
    session.user = null;
    expect((await send(false, "media-pub-guest0001")).status).toBe(401);
    session.user = u;
    expect((await send(true, "media-pub-owner0001")).status).toBe(201);
    expect((await send(true, "media-pub-owner0002")).status).toBe(402); // the welcome premium credit is spent: refused before the photo is touched
    expect(await db.cardMedia.count({ where: { id: m.id, cardId: { not: null } } })).toBe(1); // still attached to the first card only
  });
});
