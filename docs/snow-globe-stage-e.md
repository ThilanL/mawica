# Christmas Snow Globe: Stage E report (Android and iPhone AR)

> Screenshots referenced in this report live in `docs/screenshots/snow-globe/`, which is kept locally and not committed (regenerate with `scripts/globe/render-gallery.mjs`).

Status: **2026-11-24. Stage E is complete and waiting for approval.** Nothing is committed, pushed or deployed. **It has not been opened on a real Android phone or iPhone.** Everything below was checked on this Mac with Apple's USD tools and headless Chrome. Stage F (optimisation, thumbnails, device checks) has not started.

## 1. What the recipient gets

The snow globe card now shows **View in AR** beside Replay, through the existing `ArButton`, like the gift and tree cards. Each device gets the existing route:

| Device | Experience |
|---|---|
| **Android** (Chrome with ARCore, WebXR) | Find the floor, tap to place the globe at real size (220 mm tall, 180 mm glass, 170 mm base), resting exactly on the floor with a soft 30 cm contact shadow. Inside: the full miniature scene with **real falling snow, chimney smoke, flickering windows and the star's glow and light**. **Tap the globe for a snowstorm** that settles. The recipient's names are engraved on the back. The personal wish card (60% of the usual size, 17 × 22 cm) rises beside the globe and turns to face the viewer. Tapping it opens the full message, as on the other cards |
| **iPhone** (Safari, AR Quick Look) | The same globe and scene at real size, red lacquer and gold base, gold logo, transparent glass (no refraction in Quick Look), 28 snowflakes falling on a seamless 12 s loop, a breathing, turning star, the engraved names on the back and the wish card rising beside it. The Quick Look banner offers "Read your card" (existing behaviour) |
| **Reduced motion** | Android: the finished scene, still. iPhone: a separate still file, as for the other cards |
| **Computer** | The existing QR-code dialog to open the card on a phone |
| **In-app browsers** | The existing "Open in Safari / Chrome" help |
| **Other phones** | No button, as before |

**Personal data:**
- **Android:** names and message are drawn in the page and never leave it.
- **iPhone:** the phone downloads the *generic* globe file once, draws two pictures (the engraving and the wish card) and swaps them into the file in memory, then hands it to Quick Look as a `blob:` URL. Nothing personal is uploaded or stored. The generic files contain no names (a test checks this).

## 2. How the iPhone file is made (Stage A proposal 6.3)

Exporting the whole globe on a phone would take seconds and a lot of memory, so the work is split:
1. **Ahead of time** (`node scripts/globe/export-ar.mjs`), the real model is built with the `ar` profile and exported:
   - a blank engraving and a blank wish card
   - numbers rounded to 0.01 mm
   - opaque textures as JPEG
   - a small manifest naming the two swappable texture files
2. **On the phone** (`ar/globe-usdz.ts`): it fetches the file and manifest, draws the engraving and wish (stored flipped, as the exporter stores textures) and re-zips the file exactly as Quick Look requires: stored, model file first, every file aligned to 64 bytes.
   - Measured here: **150 ms animated, 60 ms still**.
   - The gift and tree cards build their files on the phone, which takes seconds for a model this size.

## 3. Files and validation

| File | Size | Notes |
|---|---|---|
| `public/ar/snow-globe.usdz` (+ `.usdz.json`) | 6.4 MB | Animated: 28 flakes plus the star, 58 tracks, 12 s at 10 fps, 55.6k triangles |
| `public/ar/snow-globe-still.usdz` (+ `.usdz.json`) | 6.0 MB | Reduced motion, finished pose |
| `public/ar/snow-globe.glb`, `snow-globe-still.glb` | 3.1 / 2.9 MB | Generic glTF (validation, lab). Android builds the live scene itself |
| `public/models/snow-globe/{cottage,reindeer,lantern}-ar.glb` | 434 / 175 / 65 KB | Lighter AR variants from the Blender pipeline: 5.3k, 2.4k and 1.2k triangles, 256 px textures |

**Size history:** the first export was 21.9 MB USDZ, 9 MB GLB and 140k triangles. It came down through:
- lighter AR models
- dropping three unused UV sets the source models carried
- baked instances
- lower segment counts
- JPEG for opaque textures
- 5-decimal numbers

**6.4 MB is above the 5 MB I aimed for.** Two thirds is geometry text, since USDA is plain text. Stage F options: fewer bough cards or shrubs in AR, or simpler snowflake decorations.

| Check | Result |
|---|---|
| Apple `usdchecker --arkit`: generic animated, generic still, **personalised** animated, **personalised** still | **Success** on all four (after setting normal maps to the standard scale) |
| Apple `usdrecord`, personalised still | `e04`: wish card upright and readable beside the globe, gold logo on the front. `usdrecord` has no environment lighting, so gold looks dark; Quick Look lights with its own |
| Swapped engraving texture inside the file | `e05`: "For Nadia / With love, Sam" (shown flipped back) |
| Live Android scene (lab, no camera) | `e01`: globe at real size on a 10 cm grid, falling snow, smoke, wish card facing the viewer. `e02`: reduced motion. `e03`: the generic GLB reloaded in three.js |
| Model grounding (lab report) | 180 × 220 × 180 mm, `minY` = 0.0000 |
| Website card after the shared builder changes | Unchanged (re-rendered front view) |

## 4. Tests

| Check | Result |
|---|---|
| `tests/globe.test.ts` | 44 tests pass. Stage E adds:<br>• AR key, model and Quick Look routing<br>• for both generic files: size budget, manifest naming two distinct textures, model file first, every entry 64-byte aligned, metres and Y up, no personal text<br>• personalising swaps only the two pictures, keeps every other file byte-identical and stays aligned; an unknown file is refused<br>• the AR model is the shared globe with the smaller wish card, the 30 cm shadow, and tap-storm on Android only |
| `tests/ar-gift.test.ts`, `ar-support`, `ar-wish` | Pass. The public AR file list includes the snow globe files; per-file budgets are 7 MB for the snow globe and unchanged for the gift and tree |
| Full suite | **560 passed, 26 failed:** the same 26 pre-existing `LEDGER_DRIFT` failures in `delivery.test.ts` and `scheduling.test.ts` (they also fail on a clean checkout of HEAD) |
| `tsc --noEmit`, `eslint src tests scripts` | No errors in project files; the 2 pre-existing warnings in `tests/email-resend.test.ts` |

## 5. Files

**Added**
- `src/components/cards/premium3d/ar/globe-ar.ts`: AR model (shared globe, `ar` profile, USDZ flakes, live snow, smoke and storm for Android)
- `src/components/cards/premium3d/ar/globe-usdz.ts`: generic export, manifest, on-phone personal swap, aligned re-zip
- `scripts/globe/export-ar.mjs`: writes the generic AR files from the real model
- `public/ar/snow-globe{,-still}.{usdz,usdz.json,glb}`, `public/models/snow-globe/*-ar.glb`
- `docs/snow-globe-stage-e.md`, `docs/screenshots/snow-globe/stage-e/*`

**Modified**
- `cards/arSupport.ts`: `AR_KEYS` gains `snow-globe`
- `ar/model.ts`: optional `wish.scale`, `shadow`, `live()`, `onTap()`; `buildArModel(key, names?)`
- `ar/scene.ts`: wish card scale, per-frame `live()` hook
- `ar/webxr.ts`:
  - model-sized shadow
  - names passed to the model
  - a tap on the model (not the card) calls `onTap`
  - framebuffer height for snow sizing
- `ar/quicklook.ts`: the snow globe uses the swap path
- `ar/ArLab.tsx`: globe framing, names in the live preview, generic-export hook
- `stage/cards/globe/build.ts`:
  - `prepareForAR()` bakes instances, adds real back faces, writes JPEG for opaque textures and sets standard normal maps
  - AR level of detail and `-ar` asset files
  - the logo mask is now a standard white-on-black texture (no custom shader)
- `stage/cards/globe-model.ts`: AR profile (`lod`, `assetSuffix`, 256 px)
- `globe/textures.ts`: `alphaAsMask`; knit map 128 px
- `scripts/globe/process_assets.py`: AR variants, first UV set only (the web cottage also shrank from 1.6 to 1.3 MB)
- `tests/globe.test.ts`, `tests/ar-gift.test.ts`

**Unchanged:**
- the gift and tree AR behaviour (all new hooks are optional; their files and tests are untouched apart from the file list)
- the homepage hero, the other cards, wallet, credits and the database

## 6. What only a real device can confirm (needed before release)

1. **iPhone:** Quick Look opens the `blob:` file. Placement and real-world size feel right. The glass transparency and the gold under Quick Look's lighting look good. The 6.4 MB download time is acceptable on mobile data. The engraving is readable when walking round. The loop is seamless.
2. **Android:** WebXR session starts and places on the floor. The live snow and storm frame rate on a mid-range phone (about 55k triangles plus snow points). Tapping the globe versus the wish card works as intended. The camera-feed lighting on the gold.
3. Both: walking round the globe at arm's length, no surfaces appearing missing (back faces).

If you can share an iPhone and an Android phone on the same network as this Mac, I can serve the dev build to them and walk through these checks with you.

## 7. Next: Stage F

- Further AR file reduction toward 5 MB.
- GLB compression (meshopt or Draco) for the web assets.
- Catalogue thumbnails and the 2D fallback still rendered from the 3D model.
- A lazy-loading audit of the homepage and catalogue.
- Visual regression baselines.
- Real-device performance.
