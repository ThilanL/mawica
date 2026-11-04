# Cinematic visual upgrade: asset and design plan

**Status: plan only. No site code has been changed.** No final artwork exists yet. Nothing here may be marked
`production` until the owner approves real images. Photorealism will not be imitated with SVG or CSS.

Reference: the supplied full-page landing mock (hero globe, six-card gallery, how it works, phone showcase,
CTA with winter scenery, footer). Current registry: `src/content/artwork.ts` (all six `placeholder`) and
`src/content/hero.ts` (`isPlaceholder: true`). Existing per-scene specs: `docs/visual-assets.md`.

## 0. Reference items that conflict with the brief (will NOT be copied)
| In the reference | Decision |
|---|---|
| "What Our Creators Say" with named people, photos, star ratings | Removed. No fictional testimonials, reviews or stats. Replace with a "Why Mawica" or recipient-experience block. |
| "Sign In" button and search icon | No accounts and no search exist. Keep the current header (no fake controls). |
| "Add ... optional photo" in step 02 | Photo upload does not exist. Copy stays "name and message". |
| "3D greeting cards" copy | Cards are animated 2D scenes. Use "animated, interactive". Avoid claiming 3D. |
| Sixth card named "Classic Card" | Keep the real template "New Year Celebration". The mock's card art is a letter, so it is replaced by the champagne scene. |
| "No cost. No limits." | Limits exist (5 publishes per hour per client). Use "Free to create". |
| Phone mock shows "Merry Christmas" baked into art | Text is never baked in. Phone shows a live, dynamic card (see section 3). |
| Pricing, app-store or "iOS/Android" badges implying an app | Copy says "works in the browser, no app needed" (matches the mock). |

## 1. Visual gap analysis (current vs reference)
| Area | Current | Reference | Gap |
|---|---|---|---|
| Hero globe | Flat SVG globe, purple, temporary | Photoreal glass, village, rose-gold base, ornaments, bokeh trees | Needs a rendered globe plus a wide scenic hero plate |
| Hero background | Flat ivory/lavender gradient | Snowy scene bleeding off the right edge, lantern, baubles, pine | Needs a hero background plate (desktop wide, mobile portrait) |
| Hero type | Correct copy and layout | Plum and rose two-tone headline | Small: gradient text on "A Lot of Love." |
| Card gallery | 6 SVG thumbnails | 6 photoreal 4:3 stills in a 3x2 grid | 6 thumbnail stills (can be derived from scene art) |
| Scenes (recipient) | SVG scenes | Not shown, but must match gallery quality | Layers per scene (see manifest) |
| How it works | Pills with icons | Icon circles joined by arrows on a soft band | Light restyle; no new art |
| Device showcase | None (Recipient showcase is CSS) | Real hand with phone, bauble, ribbon, candle | 1 photoreal plate, with a live card rendered into the phone screen |
| Final CTA | Gradient panel | Cinematic dusk mountains and chalet | 1 scenic plate (desktop, mobile) |
| Footer | Dark plum, OK | Dark plum, wordmark, socials | Small |
| Social icons | Absent | Instagram, Facebook, YouTube, LinkedIn | Only add if real accounts exist (owner to confirm) |

## 2. Asset manifest
General: sRGB, no baked-in text, snow, glows, sparkles, confetti or fireworks (code animates those). Subjects
are transparent (PNG source, delivered as WebP with alpha). Plates are opaque WebP. Deliver 2x only; the
loader makes smaller sizes. Keep the subject in the upper 55% of card scenes (greeting panel covers the bottom
42%). Filenames are exact and live under `public/art/`. Source PSD/PNG files are kept outside the repo.

### 2.1 Hero and site plates
| # | File | Variant | Size (px) | Ratio | Alpha | Target size | Animation | Fallback |
|---|---|---|---|---|---|---|---|---|
| H1 | `hero/globe@2x.webp` | all | 2400x2720 | 600:680 | yes | <= 260 KB | float, parallax 12px, entrance, snow clip, lights | current SVG + "temporary" note |
| H2 | `hero/plate-desktop@2x.webp` | >= 1024 | 2880x1240 | ~21:9 | no | <= 220 KB | gentle zoom 1.00 to 1.04 (transform), slight parallax | ivory/lavender gradient |
| H3 | `hero/plate-mobile@2x.webp` | < 1024 | 1170x1000 | ~7:6 | no | <= 120 KB | gentle zoom only | gradient |
| H4 | `hero/foreground-ornaments@2x.webp` | >= 768 | 1400x700 | 2:1 | yes | <= 120 KB | parallax 20px (opposite direction) | omitted |
| S1 | `site/phone-showcase@2x.webp` | desktop | 1600x900 | 16:9 | no | <= 160 KB | none (live card sits in the phone screen via a measured quad) | gradient + CSS phone |
| S1m | `site/phone-showcase-mobile@2x.webp` | mobile | 1000x1000 | 1:1 | no | <= 110 KB | none | gradient + CSS phone |
| S2 | `site/cta-scenery@2x.webp` | desktop | 2880x900 | 3.2:1 | no | <= 200 KB | slow zoom | plum/lavender gradient |
| S2m | `site/cta-scenery-mobile@2x.webp` | mobile | 1170x900 | 1.3:1 | no | <= 110 KB | none | gradient |
| S3 | `site/bauble-accent@2x.webp` | >= 768 | 600x600 | 1:1 | yes | <= 60 KB | slow float | omitted |

H1 must match the existing light/clip config (`snowClip`, `lights`), re-measured on delivery. The phone plate
needs the screen area left empty (flat plum) so the live card can be composited and stay dynamic.

### 2.2 Card gallery thumbnails (the six existing templates)
| # | File | Size (px) | Ratio | Alpha | Target size | Notes |
|---|---|---|---|---|---|---|
| T1 | `cards/thumb-snow-globe@2x.webp` | 960x720 | 4:3 | no | <= 70 KB | globe in snowy village |
| T2 | `cards/thumb-christmas-tree@2x.webp` | 960x720 | 4:3 | no | <= 70 KB | lit tree, living room |
| T3 | `cards/thumb-special-gift@2x.webp` | 960x720 | 4:3 | no | <= 70 KB | gift with golden bow |
| T4 | `cards/thumb-warm-wishes@2x.webp` | 960x720 | 4:3 | no | <= 70 KB | lantern-lit snowy street / window |
| T5 | `cards/thumb-new-year-2027@2x.webp` | 960x720 | 4:3 | no | <= 70 KB | skyline, fireworks (no "2027" baked in; live type) |
| T6 | `cards/thumb-new-year-celebration@2x.webp` | 960x720 | 4:3 | no | <= 70 KB | champagne flutes, gold bokeh |

Thumbnails are stills of the final scene composition (so gallery and card match). Fallback: the current CardArt SVG.

### 2.3 Card scene layers (recipient experience, 9:16)
Backdrops are 1080x1920 opaque WebP (<= 180 KB). Subjects are transparent (<= 250 KB). Foregrounds 1080x1920
transparent (<= 80 KB, lazy). Mobile is the primary format; on desktop the stage is a centred 9:16 column, so
no separate desktop variants are needed.

| Scene | Backdrop | Main (subject) | Foreground | Notes |
|---|---|---|---|---|
| snow-globe | `scenes/snow-globe/backdrop@2x.webp` | reuse `hero/globe@2x.webp` | `scenes/snow-globe/fg@2x.webp` (optional vignette) | no new subject |
| christmas-tree | `scenes/christmas-tree/backdrop@2x.webp` | `scenes/christmas-tree/tree@2x.webp` 1000x1500, ornaments UNLIT | `.../fg@2x.webp` (foliage/bokeh, optional) | `lights[]` bottom first |
| special-gift | `scenes/special-gift/backdrop@2x.webp` | `gift-box@2x.webp` and `gift-lid@2x.webp` (2 files, same canvas 1000x1000, registered to each other) | `.../fg@2x.webp` (light flare, optional) | needs a new `lid` layer in config |
| warm-wishes | `scenes/warm-wishes/backdrop@2x.webp` | `window@2x.webp` 1000x1200, opaque scene + candle | `.../fg@2x.webp` (warm bokeh) | snow clipped to the window area (measure polygon) |
| new-year-2027 | `scenes/new-year-2027/backdrop@2x.webp` (night skyline) | none (live typography) | `.../fg@2x.webp` (gold bokeh, optional) | no baked-in numerals |
| new-year-celebration | `scenes/new-year-celebration/backdrop@2x.webp` | `flutes@2x.webp` 1000x1400, two flutes slightly apart | `.../fg@2x.webp` (gold dust, optional) | flutes need a separable left/right (2 files `flute-left`, `flute-right`) for the clink tilt |

Per scene the delivery also includes: alt text for `main`, measured light positions, and a still frame for the
gallery thumbnail. Fallback everywhere: the existing SVG scene, status stays `placeholder`.

### 2.4 Images that must be generated (none exist today)
All of section 2.1 to 2.3: 3 hero/site plates families (H1 to H4, S1 to S3), 6 thumbnails, 6 backdrops, up to 7
subject files (globe reused, tree, gift box and lid, window, two flutes), optional foregrounds. Total about 35
files. Generation and licensing are owner decisions; do not use stock images. Each file needs owner approval
before `status: "production"`.

## 3. Proposed component changes
| Component | Change |
|---|---|
| `content/artwork.ts` | Add `thumb`, `lid`, `parts[]` (two-part subjects) and per-viewport variants; add a manifest-validation test (file exists, dimensions match, status gate) |
| new `content/siteArt.ts` | Manifest for H2 to H4, S1 to S3 with `status`, sizes, fallback |
| `landing/Hero.tsx` | Background plate layer (`<picture>` with desktop/mobile sources, priority, never blank: gradient behind), foreground ornaments layer, plum/rose headline treatment. GSAP stays lazy; transforms only |
| `landing/HeroArtwork.tsx` | Read H1 from config (already supported); keep snow clip, lights, parallax |
| `landing/CardPreviews.tsx` + `CardArt.tsx` | Use T1 to T6 `<Image>` when present, else SVG; keep keyboard/preview behaviour |
| `landing/RecipientShowcase.tsx` | Replace CSS phone with plate S1/S1m plus a live `CardPlayer` composited into the measured screen rect (lazy, reduced-motion aware) |
| `landing/FinalCta.tsx` | Scenery plate S2/S2m with dark-plum text scrim for contrast |
| `landing/HowItWorks.tsx`, `Benefits.tsx` | Visual restyle only; Benefits keeps device compatibility, no stats |
| `layout/SiteFooter.tsx` | Visual polish; socials only if real URLs supplied |
| `cards/parts/ArtLayers.tsx`, `ArtStage.tsx` | Support `lid`/two-part subjects; `<picture>` backdrop; preload main on card pages |
| `cards/scenes/*` | Hook each scene to real layers; code effects unchanged |
| removed | Testimonials do not exist in code today; do not add |

No database, publishing, API or security changes are needed.

## 4. Layout plan
**Desktop (1024 to 1440+):** hero plate full-bleed behind a two-column grid. Left column max 34rem (eyebrow,
headline, copy, CTA, three trust items with icons, no stats). Globe right, large, overlapping the plate edge,
foreground ornaments bottom-right. Gallery 3x2, 4:3 images, title and one line each. How it works as four
steps on a soft lavender band. Phone showcase: image left, copy and three device steps right. CTA scenery band,
footer. Max content width 1200 to 1280px, 24 to 32px gutters, section spacing 96 to 128px.

**Tablet (768):** hero stays two columns but the globe scales to about 45% width; gallery 2x3; showcase stacks
image over copy.

**Mobile (320 to 390):** a dedicated portrait composition, in this order: eyebrow, headline, copy, primary CTA
(full width, 48px tall, above the fold at 390x844 and visible at 320x568 without scroll), then the globe over
the mobile plate (H3) with the ornaments omitted. Gallery 1 column of 4:3 stills (or a 2-column grid at >= 375),
steps as a vertical list, showcase as image then copy, CTA band image shortened with larger text scrim. Text
never sits directly on busy art without a scrim (contrast >= 4.5:1, verified by Lighthouse).

No horizontal overflow at 320, 375, 390, 768, 1024 and 1440 (checked by script at each width).

## 5. Animation integration plan
| Effect | Where | Approach |
|---|---|---|
| Snowfall | hero, snow-globe, warm-wishes window | existing canvas/CSS, clipped to measured shapes |
| Warm light flicker | hero, tree, warm-wishes candle, string lights | code glows at `lights[]`; opacity/transform only |
| Parallax | hero (plate, globe, foreground at different depths) | pointer on fine pointers; off on touch and reduced motion |
| Gentle zoom | hero/CTA plates, scene backdrops | CSS transform scale 1 to 1.04 over 20 to 30 s |
| Gift opening | special-gift | two-part box, lid lifts/tilts, rays and particles from code |
| Tree illumination | christmas-tree | glows bottom-to-top over unlit art |
| Fireworks / confetti | new-year scenes | existing particle/canvas code, unchanged |
| Reduced motion | all | final frame must look complete; CSS contract tests stay; manifest test fails if a layer relies on motion |

All animation uses transform/opacity, off the main thread where possible, GSAP stays lazy-loaded. Personalised
text remains live DOM above the art. No audio.

## 6. Performance budget
| Metric | Budget |
|---|---|
| Hero above-the-fold images (mobile) | H3 + H1 <= 380 KB total; only these preloaded, `fetchpriority="high"` on the LCP image |
| Hero above-the-fold (desktop) | H2 + H1 + H4 <= 600 KB |
| Whole home page transfer (mobile, first load) | <= 1.2 MB; below-fold images lazy with explicit width/height |
| Card scene (mobile) | backdrop + main <= 430 KB; foreground lazy |
| JS | no growth in initial JS; GSAP and scenes stay lazy |
| Lighthouse mobile (observed throttling) | perf >= 90, CLS 0, TBT < 50 ms; a11y, best practices and SEO 100 on public pages |
| LCP | <= 2.5 s observed on mobile; simulated figure reported alongside |
| Format | WebP quality ~78 to 82 (AVIF optional later); `sizes` set so phones never fetch the 2x desktop file |
| Never blank | LCP images have a same-colour gradient or blur placeholder behind them |

Risk: photoreal plates are large. If a budget is missed, lower the plate resolution or crop rather than
removing the artwork.

## 7. Implementation sequence
1. Owner decisions: confirm this manifest, who produces the art, social links, and remove-testimonials call.
2. Owner supplies final art (or the first batch: H1, H2, H3, T1 to T6). Files are checked against the manifest
   (dimensions, alpha, weight) by a script before any code uses them.
3. Extend config and tests (manifest types, `lid`/parts support, validation test, status gate). No visual change yet.
4. Hero: plates, ornaments, globe swap, measured `snowClip` and `lights`; check no-JS and all six widths.
5. Gallery: thumbnails T1 to T6.
6. Remaining sections: phone showcase, steps restyle, CTA scenery, footer.
7. Scenes one at a time, in this order: snow-globe (reuses hero), christmas-tree, warm-wishes, new-year-2027,
   new-year-celebration, special-gift (needs the lid extension). Each is reviewed in reduced motion and on a phone.
8. Quality pass: six-width overflow check, keyboard and dialogs, reduced motion, Lighthouse before and after.
9. Owner sign-off, then flip each `status` to `production`. Local commits only; no push or deploy.

Until step 2 is complete, steps 4 to 9 are not started, and the site keeps its temporary artwork and its note.
