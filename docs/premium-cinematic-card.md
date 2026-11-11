# Lumi's Wish: Cinematic (Phase 2E)

Local only: nothing is deployed. The six standard cards, the homepage hero, the homepage Lumi and the existing 2D premium card (`lumis-wish`) are **unchanged**. The cinematic card is a second premium template, `lumis-wish-cinema`, so the 2D card stays the fallback and the comparison until you accept this one.

## What the recipient sees
1. A midnight-plum envelope tumbles in from the distance through a layered snowstorm (golden dust and a little rose and lavender light at other depths) and slows to a stop in front of the camera.
2. The wax seal flap swings open, golden light spills from the opening, the card slides straight out, turns toward the viewer and opens (top-fold: the cover flips forward and up).
3. Lumi pops out above the page and hops; if the sender added a photo, it floats beside Lumi in a gold frame with a little parallax.
4. The recipient's name, the sender's name and the message are set on the 3D paper as real text. Nothing times the reader out: short messages move on by themselves after a reading time, longer ones wait for **Continue**.
5. The Mawica ending: `mawica.`, `www.mawica.com`, "Send your feelings to others.", **BRING YOUR WISHES TO LIFE.**, a **Create your own card** button and **Read again**. It replaces the message layer (never sits over it) and nothing redirects.

## Architecture
| Piece | File |
|---|---|
| Registry (second premium template, `MEDIA_TEMPLATE_KEYS`) | `src/modules/templates/registry.ts` |
| Scene entry, DOM message, controls, ending, fallbacks | `src/components/cards/premium3d/CinematicScene.tsx` |
| Lazy 3D canvas (three.js + react-three-fiber live only here) | `.../CinematicCanvas.tsx` (+ `Envelope`, `CardModel`, `LumiModel`, `MediaFrame`, `Particles`) |
| Choreography (pure maths, seekable, tested) | `.../timeline.ts` |
| Particle environments (winter default, `stardust` example) | `.../ambient.ts` |
| Renderer choice, reading time | `.../support.ts` |
| Procedural canvas textures (no image downloads) | `.../textures.ts` |
| Dev viewer (404 in production) | `/lab/cinema` |

`scenes/index.ts` registers it with `dynamic(() => import(...))`; `CinematicScene` loads the canvas with `dynamic(..., { ssr: false })`. A test asserts three.js is imported only by `components/lumi` and `components/cards/premium3d`, and the canvas is reachable only through that dynamic import. The homepage Lumi (`LumiCanvas.tsx`) is not touched; the cinematic Lumi is a separate implementation with the same look.

## 3D design
- **Geometry:** real meshes with thickness: envelope back box plus three bevelled folded panels (each a little proud of the last), a hinged flap (outer plum, inner lining, gold edge trims), a wax-seal cylinder with gold ring and extruded star; card page and cover as boxes with real depth and a hinge. Lumi is an inflated, welded-and-smoothed extruded star with eyes, pupils, highlights, mouth and cheeks.
- **Materials:** `MeshPhysicalMaterial` (sheen, clearcoat, bump grain, metal gold, wax), procedural environment reflections (`RoomEnvironment` through PMREM: no HDR file), ACES filmic tone mapping.
- **Light and depth:** lavender sky, warm key, amber back rim (as the homepage Lumi), rose and lavender fills, a golden point light **inside** the envelope that lights the lining and the card, additive light shafts, fog into plum night, particles at far, middle and near depth with wind streaking while the storm is strong.
- **Camera:** a perspective camera (38°) driven by `poseAt(t, aspect)`: it follows the envelope sideways in, dollies toward it, rises with the card, then frames the opened card. Distance is fitted to the aspect ratio, so a phone gets the whole envelope and then the page at full width.
- **No clipping by construction:** the card moves with the envelope (position and orientation, including the tumble); while inside the pocket it has no yaw or tilt; it must clear the pocket's top edge before it turns (all asserted in `tests/cinema.test.tsx`).

Timeline (s): arrival 0–6.4 (S-curve: speeds up through the storm, eases to a stop) · flap 7.6–9.1 · glow 8.2–10.2 · card slides out 9.1–10.9 · turn 10.9–12.6 · open 12.6–14.2 · Lumi 13.8–15.0 · reading from 15.2 (open-ended).

## Lumi (3D)
Squash and stretch (anticipation, airborne stretch, landing squash, settle; volume-preserving), random blinks (squint with joy), pupils and head that follow the pointer, open "happy" mouth while airborne, a slow wander, and a celebration on tap: bigger hops, a full spin and a burst of golden sparkles. Procedural mesh animation, no rig.

## Photo (video is NOT enabled)
Implemented end to end for **one photo**. **Video upload is not enabled**: it needs a server-side transcoder (`ffmpeg` + `ffprobe`) in an isolated worker, and neither is installed or configured here, so by the brief the upload path is stopped rather than approximated. `VIDEO_POLICY` in `src/modules/media/limits.ts` records the intended limits (5 s, 720p, 1–2 MB, muted start, accessible sound control) and a test pins that it is disabled; uploads whose bytes are a video are refused with a clear message. The 3D frame is ready for a video texture; that path is untested and not wired.

### Pipeline (`src/modules/media/`)
1. **Who:** signed-in owner only (session from the cookie), same-origin request required (CSRF), raw body (no multipart parser, no filename, no client path).
2. **Cheap checks first:** size cap 8 MB read with a streaming limit (an endless body is cut off), type from **magic bytes** (JPEG, PNG, WebP), declared `Content-Type` must agree, SVG/GIF/HTML/PDF/executables/video refused.
3. **Quotas:** 8 uploads/hour and 20/day per account, 40/day per IP, 2000/day global, 6 unclaimed photos per account; each returns a clear message (429/409 with `Retry-After`).
4. **Safe re-encode (`sharp`):** decode, apply EXIF orientation, scale to fit 1280 px, convert to sRGB, write a **new WebP**, lowering quality and then size until it is ≤ 500 KB. Nothing of the original survives: no EXIF/GPS/ICC/XMP, no appended or polyglot payload, no animation (animated files are refused), decompression bombs refused (40 MP input cap, one libvips thread). The output is re-checked to be a single still WebP with no metadata blocks.
5. **Storage:** PostgreSQL (`CardMedia` metadata + `CardMediaBlob` bytes), behind a `MediaStore` interface so Azure Blob or S3 (private container) can replace it. Database CHECKs repeat the limits (≤ 600 KB, 16–4096 px, `image/webp`, valid hash).
6. **Claiming:** `mediaId` is accepted only by `POST /api/cards` and `POST /api/schedules`, and claimed by one conditional update **inside the same transaction as the credit spend**. A stranger's photo, an already-used photo, or a template that cannot carry a photo rolls back everything (no card, no reservation, no credit used). Replays with the same `Idempotency-Key` return the same card; two simultaneous publishes claiming one photo: exactly one wins.
7. **Serving:** `GET /api/media/[id]` is authorised on every request: the owner any time; **everyone only while the card is PUBLISHED**; anyone else gets the same 404 as a missing id. Scheduled cards stay private until the worker publishes them; cancelled cards stay private; moderation removal hides the photo from everyone. Headers: fixed `image/webp`, `nosniff`, `CSP: default-src 'none'; sandbox`, `CORP: same-origin`; public photos use `no-cache` + `ETag` so a removed card disappears at once.
8. **Cleanup:** unclaimed uploads are deleted after 24 h; photos of cards cancelled or removed more than 24 h ago are deleted (`npm run admin -- purge-media`, also `purgeOrphanMedia`); deleting an account or card deletes its photos (cascade). The owner can delete an unclaimed photo (`DELETE /api/media/[id]`; the wizard does so when the photo is removed or the template changes).
9. **No external URLs:** the scene only ever loads `/api/media/<uuid>` or a local `blob:` URL during preview.

### Credits, scheduling, delivery (unchanged)
The cinematic card is PREMIUM: one total credit plus one premium credit, no new credit type. The wallet engine, reservations, idempotency, cancellation and the delivery worker were not changed; photo claiming is added inside the existing transactions. The existing wallet, scheduling and delivery suites pass unchanged (counts below).

## Performance
Everything below was measured in **headless Chrome with software WebGL (SwiftShader)** on a developer Mac: it is a floor for relative comparisons, **not** what a phone GPU does. No real phone or low-power device was available, so real frame rates and GPU memory are **unmeasured**.

| Measure | Result |
|---|---|
| Homepage JS | 613.1 KB raw / 191.9 KB gzip (baseline 612.6 / 191.8: +0.5 / +0.1 KB, from the scene-map entry); no three.js in any chunk the homepage loads |
| `/create` JS | 726.0 / 223.5 KB gzip (baseline 721.3 / 222.1: photo field and second premium choice) |
| 3D scene (lazy, only when a cinematic card plays) | about 270 KB encoded in 1 large chunk (238 KB three.js + react-three-fiber) plus small scene chunks; whole `/lab/cinema` page 459.6 KB encoded across 16 files, 133 KB of which is the shared app shell |
| Asset transfer | 0 KB images/fonts for the scene (all textures procedural); a photo is ≤ 500 KB WebP |
| Scene cost | 31 draw calls, about 2k triangles in the intro, about 6–10k with Lumi (10 vs 6 bevel segments on phones), 21–33 geometries, 9–10 textures; particles 1,460 desktop / 804 phone |
| Frame rate, desktop 1280x800, software GL | storm 56 · envelope opening 32 · card opening 17 · reading 32 fps |
| Frame rate, 390x844 @2x, 4x CPU slowdown, software GL | storm 57 · opening 53 · card opening 21 · reading 30 fps (pixel density stepped down 1.5 → 1.2 on its own) |
| Memory | JS heap 10–13 MB; GPU texture memory estimated at about 11 MB plus the reflection map (estimate from texture sizes, not measured) |
| First paint / first 3D frame | first-contentful-paint 0.63 s desktop, 0.71 s phone-throttled; first 3D frame statistics at about 6.1 s / 6.4 s (includes downloading and compiling the chunk and building the reflection map in **software**) |
| After the animation | rendering stops completely about 25 s after the card is at rest until the person touches it (verified: the frame stamp stops advancing); idle between is capped near 30 fps |

Controls: pixel ratio capped (1.75 desktop, 1.5 phones and 4-core devices) with adaptive step-down, particle budgets (phones 55%), rendering paused when the page is hidden or scrolled out of view (time is accumulated from frame deltas, so pausing never skips the story), geometry/texture disposal on unmount, `frameloop="demand"`, a low-performance guard (under 14 fps for three seconds at the lowest density falls back to the 2D card) and a WebGL context-loss fallback.

## Fallbacks and accessibility
- No WebGL, context lost, render error or very low frame rate → the existing **2D Lumi's Wish** with the same text.
- `prefers-reduced-motion` → the finished card as one static 3D frame, message visible at once, no particles, no animation.
- The greeting is real server-rendered DOM text (works before JavaScript and for assistive technology); the ending has `aria-hidden`/`inert` until it is shown; Skip intro, Continue, Create and Read again are 44 px targets; a visible focus ring everywhere; the scrollable message is keyboard focusable.
- No audio and no video, so nothing autoplays with sound.

## Visual acceptance (honest evaluation)
Screenshots: `docs/screenshots/cinema/` (`01`–`10` staged stills at desktop and phone sizes from the dev viewer, `journey-*` and `recipient-*` from the production build with a real upload, `preview-animation.webp` a **frame-stepped** animation, 211 frames at 12 fps, not a real-time capture).

What is genuinely 3D: a perspective camera moving through a scene with real thickness, parallax between storm layers, a hinged flap and cover that reveal inner faces, light that is physically placed (inside the envelope), a card that slides out and turns in depth, a Lumi with real volume that squashes, stretches and turns, and a photo frame that tilts independently of its photo. It is **not** a film-quality render: there are no shadows, no depth of field, no motion blur, and the envelope and card are simple low-poly forms with procedural, not photographic, materials.

Assessment by dimension: depth good; camera motion good in the arrival and reveal, the final reframe is functional rather than elegant; lighting good once the envelope read as plum (it first read as pale lavender and was darkened after review); materials adequate (satin and foil feel, no fabric detail); Lumi recognisable and expressive but the face is small at the open-card scale; typography clear and readable (17–21 px on phones, 15+ enforced by a test in the journey); mobile readability good, long messages scroll inside the page; brand consistency good (plum, gold, rose, lavender, same wordmark treatment as the homepage). Known weaknesses: the golden glow can look like a hot spot on the flap; snow is dense on phones in the first seconds; no real-device check; the envelope's folds are implied by panels rather than modelled creases.

## Tests
`tests/cinema.test.tsx` (25: registry, choreography, no-clipping invariants, camera fit, page rectangle on phones, particles, frame aspect, renderer choice, reduced motion, SSR text, ending copy and separation from the message), `tests/media.test.ts` (33: validation, processing, privacy, scheduled access, failed uploads, quotas, cleanup, routes), `scripts/cinema-journey.mjs` (33 browser checks including a real upload, owner-only and public access, reduced motion, no-WebGL fallback, mobile layout), `scripts/cinema-perf.mjs`, `scripts/cinema-shots.mjs`, `scripts/cinema-preview.mjs`.
