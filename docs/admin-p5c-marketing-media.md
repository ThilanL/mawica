# Mawica Admin P5C — Marketing media & campaigns (local)

Branch: `feature/admin-p5c-marketing-media`  
Baseline: `a89f521fd366aee36b7dd3c70139ec76c6b7abad` (`feature/admin-p5-cms-foundation`)  
Status: **`mawica_test` migration applied; local commit created after validation**

## Test results (local)

| Suite | Result |
| --- | --- |
| admin vitest (all) | **61/61** pass |
| consumer vitest (all) | **553/553** pass |
| admin marketing-media-service (DB) | pass (upload/list/preview/replace/delete, refs, campaign publish/rollback, RBAC, audit) |
| consumer CMS + media + campaign unit | pass |
| `tsc` web + admin | clean |
| `npm run build` (web + admin) | clean |

Applied: `20261122010000_cms_marketing_media` on **127.0.0.1:5433/mawica_test** only (additive SQL).

## Database schema and migration

Prepared only (do not apply without approval):

`prisma/migrations/20261122010000_cms_marketing_media/migration.sql`

| Object | Purpose |
| --- | --- |
| `CmsMarketingKind` enum | `IMAGE` \| `VIDEO` |
| `CmsMarketingAsset` | Title, alt, MIME, storage keys, dimensions, duration, size, sha256, soft-delete, uploader |

Campaigns reuse existing `CmsDocument` / `CmsRevision` keys:

- `campaign.christmas`
- `campaign.newyear`

Rollback = publish a prior revision (same CMS publish path as P5B).

## Storage architecture

| Concern | Design |
| --- | --- |
| Root | `storage/cms-marketing/` (gitignored) or `CMS_MARKETING_MEDIA_DIR` |
| Layout | `{uuid}/full.{ext}` + optional `{uuid}/thumb.webp` |
| Isolation | Never CardMedia / customer blobs |
| Keys | UUID path segments only; traversal rejected |
| Images | Magic-byte sniff → sharp re-encode + thumb |
| Videos | Magic-byte sniff → store as-is (no exec) |
| Public URL | `/marketing-media/{id}` and `/marketing-media/{id}/thumb` (CDN-cache headers) |
| Admin preview | `/api/cms/media/{id}/file?variant=thumb\|full` (RBAC) |

## API endpoints

### Admin (RBAC)

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/cms/media` | `cms:read` |
| POST | `/api/cms/media` | `cms:write` |
| GET | `/api/cms/media/[id]` | `cms:read` |
| PATCH | `/api/cms/media/[id]` | `cms:write` |
| DELETE | `/api/cms/media/[id]` | `cms:write` (blocks if CMS refs unless `?force=1`) |
| POST | `/api/cms/media/[id]/replace` | `cms:write` (same id/URL) |
| GET | `/api/cms/media/[id]/file` | `cms:read` |
| PUT/POST | `/api/cms/[key]` / `…/publish` | existing CMS write/publish for campaigns |

### Public consumer

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/marketing-media/[id]` | Full asset; 404 if missing/deleted |
| GET | `/marketing-media/[id]/thumb` | Image thumb; videos 404 |

Audit: `cms.media_uploaded` / `cms.media_updated` / `cms.media_deleted`.

## Campaign configuration examples

```json
{
  "season": "christmas",
  "anchorId": "christmas",
  "title": "Christmas Cards",
  "description": "Four festive cards ready to personalise and share.",
  "ctaLabel": "Browse Christmas cards",
  "ctaHref": "/#christmas",
  "mediaAssetId": null,
  "sectionVisible": true,
  "startsAt": "2026-11-01T00:00:00+11:00",
  "endsAt": "2026-12-26T00:00:00+11:00"
}
```

```json
{
  "season": "new-year",
  "anchorId": "new-year",
  "title": "New Year Cards",
  "description": "Welcome the year ahead with a card that feels personal.",
  "ctaLabel": "Browse New Year cards",
  "ctaHref": "/#new-year",
  "mediaAssetId": "11111111-1111-4111-8111-111111111111",
  "sectionVisible": true,
  "startsAt": "2026-12-20T00:00:00+11:00",
  "endsAt": "2027-01-15T00:00:00+11:00"
}
```

Active when: published revision exists (or TypeScript fallback defaults), `sectionVisible`, and `now ∈ [startsAt, endsAt)` with offset datetimes.

## Permission matrix

| Role | cms:read | cms:write | cms:publish | Media upload/replace/delete | Campaign draft | Campaign publish |
| --- | --- | --- | --- | --- | --- | --- |
| OWNER | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| OPS | ✓ | — | — | read only | read | — |
| READONLY | ✓ | — | — | read only | read | — |
| MODERATOR / SUPPORT / FINANCE | — | — | — | — | — | — |

## Admin UI

- `/cms` — document list + link to media library; includes campaign docs
- `/cms/media` — upload, search, kind filter, details, replace, soft-delete
- `/cms/campaign.christmas` & `/cms/campaign.newyear` — JSON editor, MediaPicker, draft preview, revision history

## Screenshots

Under `tmp/p5c-screenshots/` (local only):

| File | What it shows |
| --- | --- |
| `admin-cms-list.png` | CMS index including campaign keys + Media library link |
| `admin-media-library.png` | Marketing media library empty/upload state |
| `admin-campaign-editor.png` | Campaign editor with media picker + draft preview |
| `homepage-campaign-banner.png` | Public homepage Christmas campaign banner (fallback schedule active) |

## Security tests

- Magic-byte sniff; Content-Type mismatch rejected
- Size caps (12 MB image / 40 MB video)
- Filename sanitisation; storage key traversal blocked
- Soft-delete blocked while CMS payloads reference asset id
- Public routes 404 missing/deleted; `X-Content-Type-Options: nosniff`
- No CardMedia path reuse

## Consumer regression

- Homepage still renders `#christmas` / `#new-year` product grids
- No wedding/birthday homepage sections
- CMS table missing → campaign + hero/nav fallbacks
- Corrupt published payload → fallback
- Videos `preload="none"` (no eager large fetch); banners use thumbs for images

## Performance considerations

- Image re-encode + max edge 2400; thumbs 480 WebP
- Public `Cache-Control: public, max-age=3600, stale-while-revalidate=86400, must-revalidate` + strong `ETag` (sha256) so replace-in-place invalidates caches
- Campaign resolution parallel with hero/sections
- Homepage `instant = false` (avoid stale prerender of schedule)
- Video never autoplays

## Outstanding risks

1. **Migration unapplied** — admin media APIs return 503 until `cms_marketing_media` is applied on the target DB.
2. **Video duration/dimensions** — not probed at upload (nullable); UI shows kind/MIME/size only.
3. **Reference scan** — deletion protection uses JSON string contains on recent payloads (false positives unlikely for UUIDs; force delete available to OWNER/write).
4. **Replace kind lock** — cannot change IMAGE↔VIDEO on replace (upload new asset instead).
5. **CDN** — URLs are CDN-ready path shape; no Azure Front Door / blob wiring in this phase.
6. **Default Christmas window** — fallback defaults are active mid-Nov–Dec 2026 (intentional for local demo).

## Approval gates

- [ ] Review implementation + tests
- [ ] Approve apply of `20261122010000_cms_marketing_media` on **local/test** DB only
- [ ] Approve git commit (no push/merge/deploy in this phase)
