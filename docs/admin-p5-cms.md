# Mawica Admin P5 — CMS foundation (local)

Branch: `feature/admin-p5-cms-foundation`  
Baseline: `66e335a6a3750a04d42a6cd32342e33ab19a3e07`  
Status: **local `mawica_test` migration applied; local commit pending after validation**

## Scope delivered

### P5A — CMS foundation
- Prisma models `CmsDocument` + `CmsRevision` with published pointer, draft optimistic `draftVersion`, and staff audit linkage
- Prepared migration only: `prisma/migrations/20261122000000_cms_foundation/migration.sql` (**not applied**)
- Permissions: `cms:read`, `cms:write`, `cms:publish` (`cms:publish` OWNER-only)
- Draft vs published separation; consumers read **published revision only**
- Server Zod validation (plain text, safe hrefs), revision conflict protection, audit actions `cms.document_saved` / `cms.document_published`
- Admin nav + document list/editor; atomic publish transaction

### P5B — Editable website content
Documents (JSON, no HTML/scripts):

| Key | Content |
| --- | --- |
| `home.hero` | Eyebrow, title lines, body, CTA, annotation, benefit labels |
| `home.sections` | Gallery / Christmas / New Year / How it works / Meet Lumi / Benefits / Recipient / Final CTA |
| `site.nav` | Labels, links, create CTA, search |
| `site.footer` | Tagline, columns, copyright |
| `legal.privacy` / `legal.terms` | Structured sections (plain text) |
| `seo.site` | Titles + OG/Twitter descriptions |

No wedding/birthday sections. Visual layout unchanged; fallbacks mirror live copy.

## Permission matrix

| Role | cms:read | cms:write | cms:publish |
| --- | --- | --- | --- |
| OWNER | ✓ | ✓ | ✓ |
| OPS | ✓ | — | — |
| READONLY | ✓ | — | — |
| MODERATOR / SUPPORT / FINANCE | — | — | — |

## API routes (admin)

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/cms` | `cms:read` |
| GET | `/api/cms/[key]` | `cms:read` |
| PUT | `/api/cms/[key]` | `cms:write` |
| POST | `/api/cms/[key]/publish` | `cms:publish` |

## Publishing behavior
1. Save draft (optimistic concurrency on `draftVersion`)
2. Validate with document schema
3. Publish creates `CmsRevision`, atomically points `publishedRevisionId`, keeps prior revisions
4. History listed in admin editor
5. Conflict → 409; invalid payload → 400
6. Public site falls back to TypeScript defaults / static legal JSX when unpublished or CMS tables missing
7. Drafts never read by consumer resolvers
8. Staging `MAWICA_NOINDEX` remains env-driven (not CMS-overridable)

## Proposed migration
File: `prisma/migrations/20261122000000_cms_foundation/migration.sql`  
Apply **only** to isolated local/test DB after explicit approval. Do not run against staging/production.

## Test results (local)

| Suite | Result |
| --- | --- |
| `admin` cms-roles / cms-schemas / roles | pass |
| `admin` cms-service (DB) | soft-skipped until CMS migration applied on test DB |
| consumer `tests/cms.test.ts` | pass (fallback, draft isolation, corrupt payload, SEO escape) |
| consumer hero/brand/noindex regression | pass |
| `tsc` (web + admin) | clean |

## Screenshots
Under `tmp/p5-screenshots/` (local only, gitignored via `tmp/`):

| File | What it shows |
| --- | --- |
| `homepage-fallback.png` | Public homepage hero/nav from TypeScript fallbacks (visual design unchanged) |
| `admin-cms-list.png` | Authenticated CMS index — all 7 documents in **Fallback** (tables not migrated) |
| `admin-cms-mobile.png` | Same list at ~390px width |
| `admin-cms-editor.png` | Document editor gate: “Apply the local cms_foundation migration before editing” |

Admin screenshots used `mawica_test` (has `StaffPrincipal`). Local `mawica_dev` is behind on admin staff migrations; bring it current separately before day-to-day admin use.

## Outstanding risks
1. **Migration not applied** — draft/publish integration tests and live editor persist require local migrate approval on an isolated DB.
2. Legal CMS defaults are abbreviated; until a revision is published, the full static privacy/terms JSX remains the public fallback (intentional).
3. Admin editor is JSON-based for P5; structured field UIs can follow without schema changes.
4. Circular FK between document ↔ revision is intentional; publish must stay transactional.
5. Do not grant `cms:write` broadly until content review process is defined.
6. `mawica_dev` currently lacks `StaffPrincipal` (admin auth); `mawica_test` has it — sync local migrate history carefully so CMS deploy is still opt-in.

## Explicitly unchanged
Customer cards, wallet, 3D/AR registries/scenes, Azure/DNS/Entra, staging/production databases.
