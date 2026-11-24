# Christmas Snow Globe: Stage B validation report (visual approval gate)

> Screenshots referenced in this report live in `docs/screenshots/snow-globe/`, which is kept locally and not committed (regenerate with `scripts/globe/render-gallery.mjs`).

Status: **2026-11-24. Stage B is complete and waiting for visual approval.** Nothing is committed, pushed or deployed. Stage C (snowfall, snowstorm, smoke, twinkle, bloom) has not started.

## 1. What was built

The `snow-globe` card is now a genuine 360° 3D model, rendered by the existing card engine (`makeStage`). The previous 2D artwork scene is kept, unchanged, as the fallback for no WebGL, a lost context or a slow device. The card ID, URL, free STANDARD tier, personalisation, sharing, reduced motion, low-performance detection and lazy loading are unchanged.

One shared model (`globe-model.ts` and `globe/build.ts`) is used for the website now and AR later:
- metres, Y up, resting exactly on Y = 0, logo facing +Z
- 220 mm tall, 180 mm glass (4 mm wall), 170 mm base

| Part | Construction |
|---|---|
| Glass | Sphere cut where it enters the collar. Desktop: physical transmission (refraction through the wall). Mobile: transparent with a Fresnel edge. AR: plain opacity (Quick Look compatible) |
| Base | One lathe profile: polished gold foot, deep-red clearcoat lacquer band, gold upper rim and lip. Six extruded gold snowflakes, four gold filigree S-scrolls, the official wordmark as a gold decal on the front (the PNG is used as a mask, never redrawn), and an engraving cartouche on the back (text drawn at runtime; Stage D passes the recipient's names) |
| Ground | Polar-grid heightfield with soft drifts, a hill behind the cottage, a trodden path with footprints (generated normal and AO maps), and snow packed against the glass down to the collar |
| Cottage | Scandinavian Log Cabin (CC BY). Processed in Blender: stilts removed, voxel-remeshed snow roof, brick chimney with snow cap, warm emissive windows, door closed. 15.2k tris, 47 mm |
| Reindeer | Realistic Elk (CC BY). `Stand_Breathing_01` pose applied, coat recoloured toward reindeer grey-brown (antlers untouched), antlers protected from decimation, thin snow along the back. 6.6k tris, 36 mm to the antler tips |
| Lantern | Poly Haven `street_lamp_01` (CC0), black Victorian lamp. 3.2k tris, 56 mm, with a warm glowing bulb |
| Christmas tree | Procedural fir: alpha-tested needle-card boughs (generated texture, so no cone silhouettes), dark core, trunk. Red and gold baubles, warm garland lights, gold star |
| Pines | 6 procedural firs with snow-laden boughs (4 large, 2 small) on the hill |
| Snowman | Packed-snow balls, glossy coal eyes, brows, rosy cheeks, upturned smile, ridged carrot, twig arms with fingers, knitted red scarf with fringe, beanie with bobble |
| Presents | Three red and gold satin boxes with ribbon bands and bows |
| Shrubs | Nine snow-covered shrubs framing the edges |

Lighting (web): a 512×256 HDRI (applied to the globe's materials only, so the other cards are unaffected), warm key light with soft shadows (desktop), cool rim, warm fill, and golden point lights from the cottage windows, inside the tree, under the tree, the lantern and the star. Gentle glow sprites; no bloom post-processing yet (decision D6 lands in Stage C).

## 2. Approval gallery

All images are screenshots of the working model, rendered by `scripts/globe/render-gallery.mjs` (headless Chrome, GPU) from `/lab/globe`.

| # | File |
|---|---|
| 1 | `docs/screenshots/snow-globe/01-front-hero.webp` |
| 2 | `docs/screenshots/snow-globe/02-front-three-quarter.webp` |
| 3 | `docs/screenshots/snow-globe/03-left.webp` |
| 4 | `docs/screenshots/snow-globe/04-right.webp` |
| 5 | `docs/screenshots/snow-globe/05-rear.webp` (sample engraving "For Nadia / With love, Sam · Christmas 2026", lab only) |
| 6 | `docs/screenshots/snow-globe/06-elevated.webp` |
| 7 | `docs/screenshots/snow-globe/07-closeup-cottage-tree.webp` |
| 8 | `docs/screenshots/snow-globe/08-closeup-base.webp` |
| 9 | `docs/screenshots/snow-globe/09-mobile-quality.webp` (mobile profile, 390×520 at 3×) |
| 10 | `docs/screenshots/snow-globe/10-comparison.webp` (hero poster vs 3D render) |

**Interactive 360° preview:** with the dev server running, open `http://localhost:3010/lab/globe`. Drag to rotate and scroll to zoom. Options: `?view=front|three-quarter|left|right|rear|elevated|cottage|base`, `&q=mobile`, `&spin` (turntable), `&eng=Line one|Line two`. The real card: `http://localhost:3010/lab/card?key=snow-globe`.

### Honest comparison with the hero poster

Matches:
- red lacquer and gold base with snowflakes, scrolls and the gold wordmark
- clear glass with bright rim reflections
- the poster's arrangement: snowman left, snow-roofed log cottage with lit windows and chimney, decorated tree with gold star, reindeer, black lantern on the right, red and gold presents, snowy pines

Still different, mostly by design for later stages:
- **Stage C:** no falling snow, chimney smoke, star flare or bloom yet. These carry much of the poster's sparkle.
- **Composition:** the poster's interior is more tightly packed and its figures are larger relative to the glass. Ours is limited by keeping every object 2 mm clear of the glass from every angle.
- **Cottage:** the poster's cottage is a two-gable house. Ours is the licensed log cabin.
- **Reindeer:** the poster's reindeer is a pale figurine. Ours is a realistic elk restyled toward reindeer colouring (no free realistic reindeer exists; decision R1). A paid true reindeer (about $10–35, CGTrader) remains an option.
- **Base:** the poster's base is slightly squatter, with denser filigree.
- **Backdrop:** the poster has a sunset landscape behind the globe. The card shows its own plum backdrop.

## 3. Measurements

| | Desktop | Mobile profile |
|---|---|---|
| Model triangles (instanced counted) | 155,658 | 116,410 |
| Model vertices | 124,392 | 95,332 |
| Draw calls per frame, incl. glass refraction pass (desktop) | 118–126 (was 196 before optimisation) | 62–66 |
| Triangles drawn per frame (incl. refraction pass) | about 311k | about 116k |
| Geometry memory | 2.9 MB | 2.5 MB |
| Textures | 51 objects: 14 at 1024 px or under, the rest 512 px or under (1024² ground maps, 2000×560 wordmark mask, 512 px asset maps) | same |
| Estimated GPU memory | about 60–80 MB: textures ≤ 78 MB uncompressed upper bound (clones share their image source, so actual use is lower), geometry 3 MB, shadow map 4 MB, refraction target at screen size | about 55–75 MB (no shadow map, no refraction target) |
| Frame rate | 45 fps in headless Chrome at 2880×1800 drawing size with refraction (lab, continuous spin). The card caps pixel ratio at 1.75 and adapts it | 60 fps, the vsync cap (4× CPU throttle, 1170×2532 drawing size). The card at rest settles to the engine's 30 fps idle rate |
| Time to model ready (local dev server) | 1.1 s | 1.7 s |
| Download (lazy, card chunk only) | 2.4 MB | 1.9 MB |

The frame rates were measured on an Apple M5 Mac, with emulation for the mobile profile. **No real phone has been tested.** Real-device checks belong in Stage E/F.

### Optimisation done

Draw calls dropped from 196 to 118 on desktop, without visible change:
- **Merging:** meshes are merged by material across the whole static scene (cabin, lantern, snowman, presents, tree cores and trunks). Merged geometry is re-indexed, which also cut geometry memory from 7.8 MB to 2.9 MB.
- **Instancing:** boughs, baubles, lights, snowflakes and shrubs are instanced.
- **Shadows:** the shadow map is drawn while textures arrive, then frozen, because the miniature world is static.
- **Mobile:** no shadow map, no refraction pass and fewer boughs.

Planned for Stage F: meshopt or Draco compression of the GLBs (the cabin is 1.6 MB uncompressed today), KTX2 textures, and a smaller wordmark mask.

### Shipped files (`public/models/snow-globe/`)

| File | Size | Triangles | Notes |
|---|---|---|---|
| `cottage.glb` | 1,613 KB | 15,187 | 11 materials, WebP textures ≤ 512 px |
| `reindeer.glb` | 499 KB | 6,621 | 4 materials, WebP textures ≤ 512 px |
| `lantern.glb` | 154 KB | 3,200 | 3 materials |
| `tex/env.hdr` | 377 KB | — | 512×256 HDRI |
| `tex/snow_*.webp` | 121 KB total | — | 512 px colour, normal, ARM |
| `CREDITS.md` | 1.5 KB | — | Licences and attribution |

## 4. GLB and USDZ material compatibility (for Stage E)

| Material | Web | GLB (Android, our own three.js renderer) | USDZ (iPhone Quick Look) |
|---|---|---|---|
| Glass | Transmission (desktop) / Fresnel (mobile) | Fresnel transparent (`ar` profile) | Opacity about 0.14 (`ar` profile: no transmission or refraction) |
| Red lacquer | Physical, clearcoat and sheen | Clearcoat via KHR_materials_clearcoat; sheen via KHR_materials_sheen | Clearcoat supported; sheen dropped (flatter, still red) |
| Gold | Metal 1, roughness 0.16 | Yes | Yes |
| Wordmark and engraving | Alpha-masked decal | Alpha mask | `opacityThreshold` cut-out (the exporter writes alpha-tested materials this way). To verify with `usdchecker` in Stage E |
| Snow | Textured physical with sheen and slight emissive | Yes (sheen extension) | Base colour, normal, roughness; sheen dropped |
| Needles | Alpha-tested cards | Alpha mask | Cut-out supported. The AR profile has fewer boughs; real back faces will be added (USDZ has no double-sided flag), as done for the tree AR model |
| Windows, bulb, star, tree lights | Emissive | Emissive (KHR_materials_emissive_strength) | Emissive colour (no strength above 1), no bloom |
| Authored GLB textures | WebP | WebP (EXT_texture_webp, fine in our renderer) | USDZExporter re-encodes to PNG |
| Engraving surface | Gold decal on the back of the band | Texture swap | Texture swap inside the prebuilt USDZ (Stage A proposal 6.3) |

AR readiness:
- correct physical scale and orientation, resting on Y = 0
- no dependency on the website backdrop: the globe is complete on its own, and AR viewers add their own floor shadow
- the `ar` quality profile exists, with no transmission, no shadows and lower density

Not yet done (Stage E):
- the AR exporter
- the per-model wish-panel scale
- the pre-built USDZ with the personal-texture swap

## 5. Licences (verified 2026-11-24)

| Asset | Licence | Commercial use | Modify | Redistribute in web and downloadable GLB/USDZ | Obligations |
|---|---|---|---|---|---|
| Scandinavian Log Cabin, rivetech | CC BY 4.0 (`license.txt` in the download: "Commercial use is allowed") | Yes | Yes | Yes | Credit the author, title, source and licence; state that it was changed; add no extra restrictions (no DRM) |
| Realistic Animated Elk 3D Model, WildMesh 3D | CC BY 4.0 (same; the author's page also says "use it in personal or commercial projects") | Yes | Yes | Yes | Same |
| street_lamp_01, christmas_photo_studio_04 HDRI, snow_02, red_brick_03 (Poly Haven) | CC0 | Yes | Yes | Yes | None (credited anyway) |
| mawica. wordmark | Mawica's own brand asset | — | Not restyled | — | — |

Attribution is in `public/models/snow-globe/CREDITS.md` (served publicly) and a new "3D model credits" section on the Terms page (`/terms`). **Recommendation for Stage E:** also write the CC BY credit into the `asset.copyright` field of the AR GLB and the USDZ metadata, so downloaded AR files carry their attribution. No paid assets are used.

## 6. Tests

| Check | Result |
|---|---|
| `tests/globe.test.ts` (new, 25 tests) | Pass: dimensions, grounding, base continuity, glass seated in the collar, every placement 2 mm clear of the glass, ground inside the glass, tree tallest, profiles, asset size limits, credits and Terms line, scripted pipeline |
| `tests/stage.test.tsx` (updated: the snow globe is a 3D stage whose 2D scene is only its fallback, and the build code never loads the reference images) | Pass |
| Full suite `npx vitest run` | **540 passed, 26 failed.** All 26 failures are in `tests/delivery.test.ts` and `tests/scheduling.test.ts` with `LEDGER_DRIFT`. **The same 26 fail on a clean checkout of HEAD** (verified in a temporary worktree), so they come from state already in the test database and are unrelated to this work. No wallet, credit or database code was touched |
| `npx tsc --noEmit` | No errors in project files (only stale `.next/types` entries for marketing-media routes, pre-existing) |
| `npx eslint src tests scripts` | 0 errors, 2 pre-existing warnings in `tests/email-resend.test.ts` (the untracked `admin/` folder accounts for the repo-wide lint errors) |
| Card route `/lab/card?key=snow-globe` (phone viewport) | WebGL renderer, mobile profile, message sheet with "For Nadia / Merry Christmas / With love, Sam", Continue and the ending all work |

## 7. Files

**Added**
- `src/components/cards/premium3d/stage/cards/globe-model.ts`: shared dimensions, layout, profiles
- `src/components/cards/premium3d/stage/cards/globe.tsx`: card scene module (camera, timing)
- `src/components/cards/premium3d/stage/cards/globe/build.ts`: model builder and merge-by-material
- `src/components/cards/premium3d/stage/cards/globe/textures.ts`: needle cards, knit, path and footprints, engraving
- `src/components/cards/premium3d/stage/cards/globe/GlobeWorld.tsx`: web lighting, environment, contact shadow
- `src/components/cards/premium3d/stage/cards/globe/GlobeLab.tsx`, `src/app/(lab)/lab/globe/page.tsx`: 360° preview (404 in production)
- `public/models/snow-globe/` (`cottage.glb`, `reindeer.glb`, `lantern.glb`, `tex/*`, `CREDITS.md`)
- `scripts/globe/process_assets.py` (Blender pipeline), `scripts/globe/render-gallery.mjs`
- `tests/globe.test.ts`
- `docs/snow-globe-3d-audit.md`, `docs/snow-globe-assets.md`, `docs/snow-globe-stage-b.md`, `docs/screenshots/snow-globe/*`

**Modified**
- `src/components/cards/premium3d/stage/entries/globe.tsx`: `makeStage("snow-globe", withEnding(SnowGlobeScene))`
- `src/components/cards/premium3d/stage/loaders.ts`: snow globe loader and backdrop
- `src/components/cards/premium3d/stage/Stage.tsx`: `STAGE_DURATION["snow-globe"]`
- `src/components/cards/premium3d/stage/StageCanvas.tsx`: `backdropTexture` exported (no behaviour change)
- `src/components/cards/scenes/index.ts`: comment only
- `src/app/(site)/terms/page.tsx`: 3D model credits section
- `tests/stage.test.tsx`, `.gitignore` (`/assets-src/`)
- `docs/catalogue-3d.md`, `docs/visual-assets.md`: no longer describe the card as 2D

**Untouched:** the homepage hero (`content/hero.ts`, `celebrations.ts`, `components/landing/**`, `public/art/hero/**`), the other five cards' scenes and models, the template registry, wallet, credits, pricing and the database.

**Not shipped:** `assets-src/` (git-ignored source downloads: cabin 30 MB, elk 5 MB, Poly Haven files).

## 8. Known follow-ups

- **Stage C:** snowfall inside the glass, tap and shake snowstorm, chimney smoke, twinkling, star and lantern variation, desktop-only bloom.
- **Stage D:** pass the recipient and sender names to the rear engraving, and add the golden message reveal.
- **Stage F:**
  - GLB compression (meshopt or Draco) and KTX2 textures
  - render the catalogue thumbnails from this model (they still show the old artwork)
  - a new 2D fallback still rendered from the model, so the fallback matches the 3D card
  - real-device performance checks
