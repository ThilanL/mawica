# Mawica Admin P5D — Visual CMS editor (local)

Branch: `feature/admin-p5d-visual-editor`  
Baseline: `5a8b84148653313187364e43ad001b204f8cef1c`  
Status: **local commit on `feature/admin-p5d-visual-editor` — migration applied to `mawica_test` only (not pushed)**

## Test results (local)

| Suite | Result |
| --- | --- |
| admin vitest (all) | **68/68** |
| consumer vitest (all) | **557/557** (after disposable `mawica_test` wallet ledger purge) |
| `tsc` web + admin | clean |
| production builds web + admin | clean |

## Summary

Replaces the raw JSON textarea with schema-driven forms for all CMS document keys, staff-only desktop/mobile draft previews, revision compare/restore, publish confirmation (OWNER-only), campaign visibility/schedule controls, and a deterministic marketing-asset reference index (prepared migration).

Storage, Zod validation, publish pointer, and TypeScript consumer fallbacks are unchanged.

## Asset-reference integrity

### Audit of prior approach
`assetReferenceCount` previously used `JSON.stringify(payload).includes(uuid)` over drafts + published + last 50 revisions. Gaps: double-counting published, false positives in free text, truncation, no field path.

### New design
| Piece | Role |
| --- | --- |
| `extractCmsAssetRefs(key, payload)` | Deterministic field paths (`mediaAssetId` today) |
| `CmsAssetReference` | Index rows: `DRAFT` \| `REVISION`, `documentId`, `revisionId?`, `fieldPath`, `assetId` |
| Sync on save/publish/restore | Replace-all draft refs; insert revision refs on publish |
| Soft-delete | Always `Math.max(index, field-aware scan)` when the table exists (`source: index+scan`); pure scan when missing. Never under-count if the index is incomplete. |
| Backfill | `backfillCmsAssetReferences()` + `npx tsx scripts/cms-asset-ref-backfill.mts` (idempotent; `mawica_test` only) |

Replace-in-place keeps the same asset id/URL (published content stays valid).

### Migration (local test only)
`prisma/migrations/20261122020000_cms_asset_reference/migration.sql` — additive CREATE TYPE/TABLE/INDEX/FK. Applied to **`127.0.0.1:5433/mawica_test` only**. Not applied to `mawica_dev`, staging, or production.

### Probe / missing-table behaviour
`hasCmsAssetRefTable()` probes outside transactions so a missing table never aborts an open CMS save/publish transaction. Sync no-ops when the table is absent; delete protection still uses the field-aware scan.

## Preview security

- Draft preview renders from in-admin session state (`CmsPreview`).
- Revision payloads loaded via `GET /api/cms/[key]/revisions/[id]` requiring `cms:read`.
- No public unpublished endpoints; staging noindex / consumer auth untouched.

## API additions

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/cms/[key]/revisions/[revisionId]` | `cms:read` |
| POST | `/api/cms/[key]/restore` | `cms:write` |

Existing save/publish return structured `issues[]` for field-level UI.

## Screenshots

Under `tmp/p5d-screenshots/` (gitignored via `tmp/`):

| File | Content |
| --- | --- |
| `admin-cms-list-states.png` | Draft / published / fallback badges |
| `admin-visual-hero.png` | Structured hero form + preview |
| `admin-visual-campaign.png` | Campaign schedule + media + preview |
| `admin-revision-diff.png` | Compare / restore controls |

## Outstanding risks / limitations

1. **Index incompleteness:** if sync was skipped (table missing during an older save) or a hand-edited payload bypasses service helpers, the index alone can under-count. Soft-delete therefore always retains field-aware scan and uses `Math.max(index, scan)` — do not remove the scan solely because the table exists.
2. **Extractor coverage:** `extractCmsAssetRefs` only walks known schema field paths (`mediaAssetId` today). New asset-bearing fields must extend the extractor before relying on the index.
3. Diff UI is shallow JSON compare (not a rich text diff).
4. Legal section add/remove UI limited to editing existing paragraphs (schema still allows structure via restore).
5. Migration / backfill remain **local `mawica_test` only** until separately approved for other environments.
