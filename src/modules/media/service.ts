import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hashFor } from "@/modules/security/client-hash";
import { hit } from "@/modules/security/rate-limit";
import { templateAllowsMedia } from "@/modules/templates/registry";
import { MEDIA_LIMITS } from "./limits";
import { processImage } from "./process";
import { postgresMediaStore, type MediaStore } from "./store";
import { MediaError, validateUpload } from "./validate";

type Tx = Prisma.TransactionClient;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UploadedMedia = { id: string; width: number; height: number; byteSize: number };

/**
 * Accepts one photo for the signed-in owner. Order matters: cheap checks first (type from bytes, size), then quotas, then the expensive decode.
 * The stored copy is always a fresh re-encode (process.ts). The upload is private and unattached until a card claims it.
 */
export async function uploadPhoto(
  user: { id: string },
  input: { contentType: string | null; bytes: Buffer; ip: string },
  store: MediaStore = postgresMediaStore,
): Promise<UploadedMedia> {
  validateUpload(input.contentType, input.bytes);

  const limits = await Promise.all([
    hit(hashFor("media-user-hour", user.id), MEDIA_LIMITS.maxUploadsPerHour, 3600),
    hit(hashFor("media-user-day", user.id), MEDIA_LIMITS.maxUploadsPerDay, 86400),
    hit(hashFor("media-ip-day", input.ip), MEDIA_LIMITS.maxUploadsPerIpPerDay, 86400),
    hit("media:global", MEDIA_LIMITS.maxUploadsGlobalPerDay, 86400),
  ]);
  const blocked = limits.find((r) => !r.allowed);
  if (blocked) throw new MediaError("RATE_LIMITED", "You've added a lot of photos. Please try again later.", 429, blocked.retryAfterSeconds);

  const pending = await db.cardMedia.count({ where: { ownerId: user.id, cardId: null } });
  if (pending >= MEDIA_LIMITS.maxPendingPerUser) throw new MediaError("TOO_MANY_PENDING", "You have several photos waiting. Remove one, or finish the card you're making.", 409);

  const processed = await processImage(input.bytes);

  return db.$transaction(async (tx) => {
    const row = await tx.cardMedia.create({
      data: { ownerId: user.id, contentType: processed.contentType, width: processed.width, height: processed.height, byteSize: processed.data.length, sha256: processed.sha256 },
      select: { id: true, width: true, height: true, byteSize: true },
    });
    await store.put(tx, row.id, processed.data);
    return row;
  });
}

/** Owner removes an upload that no card has claimed. Attached photos are removed with their card, never directly. */
export async function deleteOwnPending(user: { id: string }, id: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const r = await db.cardMedia.deleteMany({ where: { id, ownerId: user.id, cardId: null } });
  return r.count > 0;
}

/**
 * Claims an upload for a card INSIDE the publish/schedule transaction. One atomic conditional update: the photo must be the caller's, still unattached,
 * and the template must allow media. If any check fails the whole transaction (including the credit spend) rolls back.
 */
export async function attachMedia(tx: Tx, a: { mediaId: string; ownerId: string; cardId: string; templateKey: string; now?: Date }): Promise<void> {
  if (!templateAllowsMedia(a.templateKey)) throw new MediaError("NOT_ALLOWED_FOR_TEMPLATE", "This card can't carry a photo.");
  if (!UUID_RE.test(a.mediaId)) throw new MediaError("NOT_AVAILABLE", "That photo is no longer available. Add it again.", 409);
  const r = await tx.cardMedia.updateMany({ where: { id: a.mediaId, ownerId: a.ownerId, cardId: null }, data: { cardId: a.cardId, attachedAt: a.now ?? new Date() } });
  if (r.count !== 1) throw new MediaError("NOT_AVAILABLE", "That photo is no longer available. Add it again.", 409);
}

export type MediaRead = { data: Buffer; contentType: string; sha256: string; public: boolean };

/**
 * Who may read a photo:
 *  - the owner, any time (before and after publication) unless moderation removed the card;
 *  - everyone, ONLY while the card it belongs to is PUBLISHED (scheduled, cancelled and removed cards expose nothing);
 *  - anyone else gets the same "not found" as a missing id (no existence signal).
 */
export async function readMedia(id: string, viewer: { id: string } | null, store: MediaStore = postgresMediaStore): Promise<MediaRead | null> {
  if (!UUID_RE.test(id)) return null;
  const m = await db.cardMedia.findUnique({ where: { id }, select: { ownerId: true, contentType: true, sha256: true, card: { select: { status: true } } } });
  if (!m) return null;
  const status = m.card?.status ?? null;
  const isOwner = !!viewer && viewer.id === m.ownerId;
  const publicNow = status === "PUBLISHED";
  if (status === "REMOVED") return null;
  if (!publicNow && !isOwner) return null;
  const data = await store.get(id);
  return data ? { data, contentType: m.contentType, sha256: m.sha256, public: publicNow } : null;
}

/** Deletes unclaimed uploads past their time-to-live and photos of cards that were cancelled or removed more than a day ago. */
export async function purgeOrphanMedia(now = new Date(), ttlHours: number = MEDIA_LIMITS.orphanTtlHours): Promise<{ orphans: number; cancelled: number }> {
  const cutoff = new Date(now.getTime() - ttlHours * 3_600_000);
  const orphans = await db.cardMedia.deleteMany({ where: { cardId: null, createdAt: { lt: cutoff } } });
  const dead = await db.cardMedia.findMany({
    where: { card: { OR: [{ status: "REMOVED", removedAt: { lt: cutoff } }, { status: "CANCELLED", scheduledDelivery: { cancelledAt: { lt: cutoff } } }] } },
    select: { id: true },
  });
  const cancelled = dead.length ? (await db.cardMedia.deleteMany({ where: { id: { in: dead.map((d) => d.id) } } })).count : 0;
  return { orphans: orphans.count, cancelled };
}

/** Public shape for the card page / DTOs. */
export const mediaSrc = (id: string) => `/api/media/${id}`;
