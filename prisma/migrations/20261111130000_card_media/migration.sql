-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE');

-- CreateTable
CREATE TABLE "CardMedia" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "cardId" UUID,
    "kind" "MediaKind" NOT NULL DEFAULT 'IMAGE',
    "contentType" VARCHAR(40) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attachedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CardMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardMediaBlob" (
    "mediaId" UUID NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "CardMediaBlob_pkey" PRIMARY KEY ("mediaId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardMedia_cardId_key" ON "CardMedia"("cardId");

-- CreateIndex
CREATE INDEX "CardMedia_ownerId_createdAt_idx" ON "CardMedia"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "CardMedia" ADD CONSTRAINT "CardMedia_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardMedia" ADD CONSTRAINT "CardMedia_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardMediaBlob" ADD CONSTRAINT "CardMediaBlob_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "CardMedia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hard limits enforced by the database too (the application already enforces them): a bug cannot store an oversized or malformed image.
ALTER TABLE "CardMedia" ADD CONSTRAINT "CardMedia_dimensions_check" CHECK (width BETWEEN 16 AND 4096 AND height BETWEEN 16 AND 4096);
ALTER TABLE "CardMedia" ADD CONSTRAINT "CardMedia_size_check" CHECK ("byteSize" BETWEEN 1 AND 614400);
ALTER TABLE "CardMedia" ADD CONSTRAINT "CardMedia_type_check" CHECK ("contentType" = 'image/webp');
ALTER TABLE "CardMedia" ADD CONSTRAINT "CardMedia_sha_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
