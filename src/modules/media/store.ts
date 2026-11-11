import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

type Tx = Prisma.TransactionClient;

/**
 * Where the bytes live. Today: a PostgreSQL table (private by construction, transactional with the card, nothing new to provision).
 * The interface is the seam for a blob store (Azure Blob / S3, private container, short-lived SAS) when volume or size makes the database the wrong place.
 */
export interface MediaStore {
  put(tx: Tx, mediaId: string, data: Buffer): Promise<void>;
  get(mediaId: string): Promise<Buffer | null>;
}

export const postgresMediaStore: MediaStore = {
  async put(tx, mediaId, data) {
    await tx.cardMediaBlob.create({ data: { mediaId, data: new Uint8Array(data) } });
  },
  async get(mediaId) {
    const row = await db.cardMediaBlob.findUnique({ where: { mediaId }, select: { data: true } });
    return row ? Buffer.from(row.data) : null;
  },
};
