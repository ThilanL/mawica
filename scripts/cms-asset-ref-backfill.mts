/**
 * Idempotent CmsAssetReference backfill for isolated local mawica_test only.
 *
 *   DATABASE_URL="$TEST_DATABASE_URL" npx tsx scripts/cms-asset-ref-backfill.mts
 *
 * Requires TEST_DATABASE_URL → 127.0.0.1:5433/mawica_test (or pass that URL as DATABASE_URL).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { extractCmsAssetRefs } from "../src/modules/cms/asset-refs";
import { isCmsDocumentKey } from "../src/modules/cms/schemas";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* use real env */
}

const url = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;
if (!url || !url.includes("5433") || !/\/mawica_test(\?|$)/.test(url)) {
  console.error("Refusing: DATABASE_URL must target local mawica_test on port 5433");
  process.exit(1);
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url, options: "-c timezone=UTC" }),
});

async function syncDraft(documentId: string, documentKey: string, payload: unknown) {
  const hits = extractCmsAssetRefs(documentKey as never, payload);
  await db.cmsAssetReference.deleteMany({ where: { documentId, scope: "DRAFT" } });
  if (!hits.length) return 0;
  await db.cmsAssetReference.createMany({
    data: hits.map((h) => ({
      assetId: h.assetId,
      documentId,
      documentKey,
      scope: "DRAFT" as const,
      revisionId: null,
      fieldPath: h.fieldPath,
    })),
    skipDuplicates: true,
  });
  return hits.length;
}

async function syncRevision(
  documentId: string,
  documentKey: string,
  revisionId: string,
  payload: unknown,
) {
  const hits = extractCmsAssetRefs(documentKey as never, payload);
  await db.cmsAssetReference.deleteMany({ where: { revisionId, scope: "REVISION" } });
  if (!hits.length) return 0;
  await db.cmsAssetReference.createMany({
    data: hits.map((h) => ({
      assetId: h.assetId,
      documentId,
      documentKey,
      scope: "REVISION" as const,
      revisionId,
      fieldPath: h.fieldPath,
    })),
    skipDuplicates: true,
  });
  return hits.length;
}

async function runOnce() {
  const docs = await db.cmsDocument.findMany({
    select: {
      id: true,
      key: true,
      draftPayload: true,
      revisions: { select: { id: true, payload: true } },
    },
  });

  let draftRefs = 0;
  let revisionRefs = 0;
  let skippedUnknownKeys = 0;
  for (const doc of docs) {
    if (!isCmsDocumentKey(doc.key)) {
      skippedUnknownKeys += 1;
      continue;
    }
    draftRefs += await syncDraft(doc.id, doc.key, doc.draftPayload);
    for (const rev of doc.revisions) {
      revisionRefs += await syncRevision(doc.id, doc.key, rev.id, rev.payload);
    }
  }
  return {
    documents: docs.length - skippedUnknownKeys,
    draftRefs,
    revisionRefs,
    skippedUnknownKeys,
  };
}

try {
  const first = await runOnce();
  const second = await runOnce();
  const totals = await db.cmsAssetReference.groupBy({
    by: ["scope"],
    _count: { _all: true },
  });
  console.log(
    JSON.stringify(
      {
        database: "mawica_test",
        first,
        second,
        tableCounts: Object.fromEntries(totals.map((t) => [t.scope, t._count._all])),
      },
      null,
      2,
    ),
  );
} finally {
  await db.$disconnect();
}
