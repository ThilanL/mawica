# Christmas Snow Globe: Stage F report (optimisation, thumbnails, regression) and final summary

> Screenshots referenced in this report live in `docs/screenshots/snow-globe/`, which is kept locally and not committed (regenerate with `scripts/globe/render-gallery.mjs`).

Status: **2026-11-24. Stage F is complete; all six stages (A–F) are done.** Nothing is committed, pushed or deployed. **Not yet checked on a real phone** (section 4).

## 1. Stage F work

| Area | Result |
|---|---|
| **Web model downloads** | Meshopt geometry compression (Blender's exporter, decoded by three.js's `MeshoptDecoder`; nothing new installed or downloaded) and only the first UV set shipped. Cottage 1.65 → 1.02 MB, reindeer 499 → 281 KB, lantern 154 → 110 KB. **Models 1.41 MB; with environment map and snow textures 1.9 MB**, loaded only by this card |
| **Phone GPU memory** | The ground's generated path maps and the needle cards drop to 512 px on phones (1024 on desktop) |
| **AR files** | Lighter AR profile plus meshopt on the AR model variants. **USDZ 5.8 MB animated / 5.5 MB still** (21.9 MB at the first export). GLB 2.8 / 2.7 MB. `usdchecker --arkit`: Success |
| **Catalogue thumbnails** | Now rendered from the 3D model with `scripts/render-catalogue.mjs` (`GPU=1`), like the other five cards, in all three aspect ratios: 13–70 KB each, within the existing 100 KB per-file and 1.5 MB total tests |
| **2D fallback** | The fallback (no WebGL, lost context, slow device) showed the older bronze hero artwork. It now shows a transparent still of the real model (`public/art/cards/snow-globe-3d.webp`, 183 KB; `-sm` 71 KB), with the 2D snow clipped to the projected glass circle. The homepage hero's own `heroArtwork` and files are untouched |
| **Lazy-loading audit (production `next build`)** | No page's initial client manifest references a chunk with the globe or three.js: not the homepage (`(site)/page`), the card page, `/create` or `/terms`. The globe's own code is one lazy chunk of **60 KB (20 KB gzipped)**; three.js is the chunk the other 3D cards already share. The AR code loads only on "View in AR" |
| **Visual regression** | `scripts/globe/visual-regression.mjs` renders six fixed views (front, three-quarter, rear with engraving, phone, a storm at 3 s, reduced motion) and compares them with baselines in `docs/screenshots/snow-globe/baseline/` (threshold 1.5% of pixels). Every view is a pure function of its time, and two runs gave **0.00% difference**. `--update` accepts new baselines |
| **Adaptive bloom** | Verified: on a GPU under about 50 fps, bloom switches itself off and the page returns to 60 fps |

## 2. Measurements (Apple M5 Mac, headless Chrome with GPU; phone figures use the phone profile with 4× CPU throttling)

| | Desktop | Phone profile |
|---|---|---|
| Triangles in the model (web) | 158k | 119k |
| Draw calls (desktop includes glass refraction and bloom passes) | 118–130 | 62–68 |
| Geometry memory | 2.5 MB | 2.1 MB |
| Textures | 65 GPU textures, mostly ≤ 512 px | 51 |
| Frame rate | 60 fps without bloom; 46 fps with bloom on this headless GPU, then 60 after the adaptive guard turns it off | 60 fps (vsync cap); about 30 fps at rest (engine idle rate), 60 during a storm |
| Model ready (local) | 1.1 s | 1.6 s |
| Downloaded by the card (lazy) | about 2.1 MB | about 2.0 MB |
| AR | Android: live scene, about 52k triangles plus snow points. iPhone: 5.8 MB USDZ, personalised in about 150 ms | |

The first page loaded in a headless session is consistently slower (warm-up), so single numbers vary by roughly ±10 fps.

## 3. Tests

| Check | Result |
|---|---|
| `tests/globe.test.ts` | **56 tests pass** (Stages B–F): dimensions and grounding, containment, motion, personalisation, AR files and swap, compression, budgets, thumbnails, fallback, baselines |
| Card, AR, hero and regression suites | Pass |
| Full suite | **571 passed, 26 failed.** The 26 are the pre-existing `LEDGER_DRIFT` failures in `delivery.test.ts` and `scheduling.test.ts` that also fail on a clean checkout of HEAD (test-database state; no wallet, credit or database code was touched) |
| `tsc --noEmit` | No errors in project files (only stale `.next/types` entries for marketing-media routes, pre-existing) |
| `eslint src tests scripts` | 0 errors; 2 pre-existing warnings in `tests/email-resend.test.ts` |
| `next build` | Succeeds |

## 4. Still needed before release (real devices)

These can't be verified on this Mac:
- **iPhone (Safari):** Quick Look opens the personalised `blob:` file; placement and size; glass and gold under Quick Look's lighting; 5.8 MB on mobile data.
- **Android (Chrome + ARCore):** WebXR placement; snow, storm and frame rate on a mid-range phone.
- **Both phones, on the card:**
  - the shake gesture (and the iOS motion prompt)
  - the shimmer sound
  - the gold reveal text on older Safari
  - the engraving's readability during the intro
  - 3D frame rate and memory

## 5. The whole upgrade at a glance (Stages A–F)

- **A:** Audit and plan (`docs/snow-globe-3d-audit.md`).
- **B:** Assets and model. Blender pipeline, licensed CC BY cottage and elk plus CC0 Poly Haven assets (credited in `public/models/snow-globe/CREDITS.md` and on `/terms`). A genuine 360° globe at real scale, sharing one model between web and AR (`docs/snow-globe-assets.md`, `docs/snow-globe-stage-b.md`).
- **C:** Snowfall kept inside the glass, tap and shake snowstorm, smoke, the lights intro, twinkle, adaptive desktop bloom, opt-in synthesised sound (`docs/snow-globe-stage-c.md`).
- **D:** Names engraved on the back (shown in the intro), golden message reveal, nothing stored (`docs/snow-globe-stage-d.md`).
- **E:** Android WebXR (live snow and storm) and iPhone Quick Look (pre-built file with personal pictures swapped in on the phone), validated with Apple's tools (`docs/snow-globe-stage-e.md`).
- **F:** This report.

**Unchanged throughout:**
- the homepage hero
- the other five cards (their scenes, models and AR)
- the card ID `snow-globe` and its free STANDARD tier
- wallet, credits, pricing and the database

## 6. Files added or changed in Stage F

- **Added:**
  - `scripts/globe/render-fallback.mjs`
  - `scripts/globe/visual-regression.mjs`
  - `public/art/cards/snow-globe-3d{,-sm}.webp`
  - `docs/screenshots/snow-globe/baseline/*`
  - `docs/screenshots/snow-globe/stage-f/*`
  - this report
- **Modified:**
  - `scripts/globe/process_assets.py`: meshopt, first UV set only, AR variants
  - `public/models/snow-globe/*.glb`: re-exported
  - `public/ar/snow-globe*`: re-exported
  - `stage/cards/globe/build.ts`: meshopt decoder, AR detail
  - `stage/cards/globe-model.ts`: phone texture size, AR profile
  - `globe/bloom.ts`: guard state exposed for the perf scripts
  - `globe/GlobeLab.tsx`: transparent option, camera handle
  - `scenes/SnowGlobeScene.tsx`: 3D still instead of the hero artwork
  - `scripts/render-catalogue.mjs`: snow globe rendered in 3D
  - `public/art/catalogue/snow-globe-*.webp`
  - `docs/catalogue-3d.md`
  - `tests/globe.test.ts`
