import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { CreateCardInput } from "@/modules/cards/schema";
import { newSlug } from "@/modules/cards/slug";
import { attachMedia } from "@/modules/media/service";
import { templateTier } from "@/modules/templates/registry";
import { expireGrants, reserveCredits, settleReservation, balances } from "./engine";
import { ensureWallet } from "./wallet";

export type PublishOwnedResult = { slug: string; replay: boolean; remaining: number; premiumRemaining: number };

export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Publishes a card owned by a signed-in user and spends its credit in ONE database transaction:
 * reserve (1 total, +1 premium for a premium tier) -> create the card -> commit. Any failure (no credit, card insert error)
 * rolls everything back, so a failed card never consumes credit and a refused request never leaves a reservation behind.
 * The tier comes from the server-side registry, never from the request. Replays of the same Idempotency-Key and request return
 * the original card instead of creating a second one; the same key with a different request throws IdempotencyKeyReuseError.
 */
export async function publishOwnedCard(
  input: Pick<CreateCardInput, "templateKey" | "recipientName" | "senderName" | "message" | "musicTrackId"> & { mediaId?: string },
  user: { id: string; email: string; emailVerified: boolean },
  opts: { idempotencyKey: string; now?: Date; slugFn?: () => string },
): Promise<PublishOwnedResult> {
  const tier = templateTier(input.templateKey);
  // mediaId joins the fingerprint only when present (legacy keys). musicTrackId is always present on new publishes.
  const request = {
    templateKey: input.templateKey,
    recipientName: input.recipientName,
    senderName: input.senderName,
    message: input.message,
    musicTrackId: input.musicTrackId,
    ...(input.mediaId ? { mediaId: input.mediaId } : {}),
  };
  const now = opts.now ?? new Date();
  const slugFn = opts.slugFn ?? newSlug;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const account = await ensureWallet(tx, user, now);
        await expireGrants(tx, account.id, now);
        const r = await reserveCredits(tx, account, { key: opts.idempotencyKey, request, premium: tier === "PREMIUM", now });
        if (r.replay) {
          const card = r.cardId ? await tx.card.findUnique({ where: { id: r.cardId }, select: { slug: true } }) : null;
          if (!card) throw new Error("Original publish is still pending"); // cannot happen: reserve+commit are one transaction
          const b = await balances(tx, account.id, now);
          return { slug: card.slug, replay: true, remaining: b.total, premiumRemaining: b.premium };
        }
        const card = await tx.card.create({
          data: {
            slug: slugFn(),
            templateKey: input.templateKey,
            recipientName: input.recipientName,
            senderName: input.senderName,
            message: input.message,
            musicTrackId: input.musicTrackId,
            ownerId: user.id,
            tier,
          },
          select: { id: true, slug: true },
        });
        // The photo is claimed in the same transaction as the credit spend: if it is not the caller's, or already used, everything rolls back.
        if (input.mediaId) await attachMedia(tx, { mediaId: input.mediaId, ownerId: user.id, cardId: card.id, templateKey: input.templateKey, now });
        await settleReservation(tx, account.id, r.reservationId, "COMMIT", { now, cardId: card.id });
        const b = await balances(tx, account.id, now);
        return { slug: card.slug, replay: false, remaining: b.total, premiumRemaining: b.premium };
      }, { timeout: 15000, maxWait: 15000 });
    } catch (e) {
      // Unique-slug collision (astronomically rare): the whole transaction rolled back, so retrying cannot double-spend.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // card.create only has one unique column that can collide: slug
      throw e;
    }
  }
  throw new Error("Could not allocate a card slug");
}
