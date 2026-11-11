import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { newSlug } from "./slug";
import { SLUG_RE, type CreateCardInput } from "./schema";

export async function createCard(input: CreateCardInput) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.card.create({
        data: {
          slug: newSlug(),
          templateKey: input.templateKey,
          recipientName: input.recipientName,
          senderName: input.senderName,
          message: input.message,
        },
        select: { slug: true },
      });
    } catch (e) {
      // Unique-slug collision: astronomically rare, but retry safely.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new Error("Could not allocate a card slug");
}

/** Never cached: removed cards must disappear immediately. */
export async function getPublishedCard(slug: string) {
  if (!SLUG_RE.test(slug)) return null;
  return db.card.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { slug: true, templateKey: true, recipientName: true, senderName: true, message: true, media: { select: { id: true, width: true, height: true } } },
  });
}

export async function removeCard(slug: string, reason: string) {
  const res = await db.card.updateMany({
    where: { slug, status: "PUBLISHED" },
    data: { status: "REMOVED", removedAt: new Date(), removedReason: reason.slice(0, 200) },
  });
  return res.count > 0;
}
