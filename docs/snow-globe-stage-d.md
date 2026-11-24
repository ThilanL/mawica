# Christmas Snow Globe: Stage D report (personalised greeting)

> Screenshots referenced in this report live in `docs/screenshots/snow-globe/`, which is kept locally and not committed (regenerate with `scripts/globe/render-gallery.mjs`).

Status: **2026-11-24. Stage D is complete and waiting for approval.** Nothing is committed, pushed or deployed. Stage E (Android and iPhone AR) has not started.

## 1. What was added

| Feature | How it works |
|---|---|
| **Personal engraving on the back of the base** | Two lines in the gold cartouche: *For {recipient}* in italic, then *With love, {sender}*. They come from the card's own names (decision D4: no new field, no schema or database change, nothing extra stored). The Mawica logo stays on the front |
| **The recipient sees it** | The intro now opens square-on to the engraved plate on the back of the base, holds about 2 s so it can be read, then sweeps round the globe, rising and pulling back, to the front hero view as the village lights come on |
| **Live in the create wizard** | Changing a name redraws only the plate's texture (debounced 180 ms). The 3D model is never rebuilt, so typing in the wizard preview stays cheap |
| **Name handling** | Names are trimmed and cut by grapheme, never inside an accented letter, to 24 characters with an ellipsis. Emoji are left out, because a single-colour engraving can't show them (they came out as solid gold blobs). Right-to-left names keep the phrase order: "For نادية", "With love, סם". Empty names give an empty gold frame (thumbnails, an empty preview) |
| **Golden message reveal** | When the message sheet appears:<br>• a gold hairline draws across its top<br>• "Merry Christmas" catches one sweep of gold light (gold gradient text)<br>• "For {name}", the message, the signature and the hint rise in one after another<br>• the sheet carries a soft gold edge glow<br>Reduced motion: shown fully gold, with no movement |
| **Room for the message on wide screens** | As the intro ends on landscape screens, the camera eases back slightly and the picture lifts, so the whole globe (base and logo included) sits above the sheet. Phone framing is unchanged |
| **No hard-coded names** | All personal text comes from the card. A test checks that the card's code contains no sample names. The samples live only in the dev lab and the render scripts |

**Scope:**
- The gold reveal, hint and sound toggle sit in `STAGE_INTERACTIVE` (`Stage.tsx`), so they appear on the snow globe only.
- The engine now passes the names to 3D scenes as an optional `text` prop. The other five cards ignore it, and their markup and behaviour are unchanged; a test checks the tree card has no gold class.

## 2. Review frames (real card route, `docs/screenshots/snow-globe/stage-d/`)

| File | Shows |
|---|---|
| `d01-intro-engraving-0.6s.webp` | Opening shot: "For Nadia / With love, Sam" engraved on the back of the base |
| `d02-intro-sweep-4.5s.webp` | The camera sweeping round the globe |
| `d03-intro-front-8s.webp` | Arriving at the front hero view |
| `d04-gold-reveal-phone.webp` | Phone: gold greeting and the reveal as the sheet appears |
| `d05-reading-desktop.webp` | Desktop: the whole globe above the sheet |
| `d06-long-names-engraving.webp` | "Maximiliana Alessandrina Josephine" and "👨‍👩‍👧‍👦 The Fernández-Ortega family of Ávila": clipped neatly, emoji dropped, accent kept |
| `d07-rtl-names-engraving.webp` | Arabic names: "For نادية / With love, سام" |

Live: with the dev server running, open `http://localhost:3010/lab/card?key=snow-globe&to=YourName&from=Sender`.

## 3. Tests

| Check | Result |
|---|---|
| `tests/globe.test.ts` | 40 tests pass. Stage D adds:<br>• engraving lines from names<br>• grapheme-safe shortening<br>• emoji removal (emoji-only names engrave nothing)<br>• right-to-left phrase order<br>• no hard-coded names in the card's code<br>• names flow Stage → StageCanvas → scene<br>• the model build doesn't depend on the names (no rebuild while typing)<br>• the intro opens behind the globe and ends in front<br>• the gold reveal appears on the snow globe and not on the tree, with a still version for reduced motion |
| `tests/stage.test.tsx` | Pass, including the shared camera rules (finite, never under 3 units from its target, smooth to under 0.6 units per 50 ms) |
| Full suite | **555 passed, 26 failed.** The same 26 pre-existing `LEDGER_DRIFT` failures in `delivery.test.ts` and `scheduling.test.ts` that also fail on a clean checkout of HEAD. No wallet, credit or database code was touched |
| `tsc --noEmit` | No errors in project files |
| `eslint src tests scripts` | 0 errors, the 2 pre-existing warnings in `tests/email-resend.test.ts` |

## 4. Files

**Added**
- `src/components/cards/premium3d/stage/cards/globe/engraving.ts`: names to engraving lines (pure, tested)
- `docs/snow-globe-stage-d.md`, `docs/screenshots/snow-globe/stage-d/*`

**Modified**
- `cards/globe.tsx`: intro camera (engraving, sweep, hero), wide-screen reading framing, passes the engraving
- `globe/build.ts`: `setEngraving()` swaps only the plate texture; the cartouche frame is now complete (its straight edges no longer sink into the curved band)
- `globe/GlobeWorld.tsx`: builds once, then redraws the engraving when names change
- `globe/textures.ts`: engraving drawn left to right, so the browser's bidi places right-to-left names
- `stage/types.ts`: optional `text` on `StageSceneProps`
- `stage/StageCanvas.tsx`: passes `text` through to the scene
- `stage/Stage.tsx`: passes the names, `goldReveal` flag on the snow globe entry, `stg-gold` class
- `app/globals.css`: golden reveal styles, with a reduced-motion rule
- `tests/globe.test.ts`

**Untouched:** the homepage hero, the other five cards' scenes and models, registry, wallet, credits, pricing, the database and the create wizard's code (the wizard preview simply shows the new engraving).

## 5. Notes for review

1. **Reduced motion and the engraving.** The reduced-motion still shows the finished front view, so the engraving on the back isn't visible there. Options: accept this, or show a static view of the plate in the still. I'd leave it.
2. **The engraving in AR (Stage E).** Same plate. On iPhone it will be a personal texture swapped into the pre-built USDZ (Stage A proposal 6.3). On Android it's the same live texture.
3. **Not yet checked on a real device:** the gold gradient text on older iOS Safari (it falls back to plain gold where `background-clip: text` isn't supported) and the engraving's readability on a small phone during the intro.

## 6. Next: Stage E

- Android WebXR and iPhone Quick Look AR, using the `ar` quality profile and the existing AR infrastructure:
  - `ArButton`
  - the QR hand-off
  - in-app browser help
- Per-model wish-panel scale.
- A generic pre-built USDZ with a personal-texture swap.
- CC BY credits written into the AR files.
