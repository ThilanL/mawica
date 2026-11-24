# Standard cards in 3D: catalogue and card redesign (Phase 2E.2)

Local only: nothing is deployed. Card names, template ids, the catalogue grid, navigation, wallet and scheduling behaviour are unchanged; saved cards render in the new scenes through the same URLs.

## What changed
| Card | Catalogue thumbnail | Full card |
|---|---|---|
| Christmas Snow Globe | rendered from its own 3D model since Stage F (`scripts/render-catalogue.mjs`, like the other five) | **Genuine 3D since Stage B (2026-11-24)**: real refracting glass, red lacquer and gold base, authored cottage and reindeer, procedural trees, snowman and terrain. The 2D artwork scene is now only its fallback. See `docs/snow-globe-stage-b.md` |
| Magical Christmas Tree | still from its own 3D scene | WebGL: furry fir (about 3,600 needle clusters, 1,400 on phones), gold/rose/lavender baubles that light one by one, fairy lights chasing up a spiral, glowing star, presents, slow camera orbit, soft snowfall |
| A Special Gift | still from its own 3D scene | WebGL: rose satin box with gold ribbon and bow, floating; ribbon slides away, bow lifts off, lid tips open, golden light and sparkles pour out |
| Warm Christmas Wishes | still from its own 3D scene | WebGL: arched frosted window with snow falling outside, candles with flickering light, string lights, slow push-in, the room warms up |
| New Year 2027 | still from its own 3D scene | WebGL: DOM countdown 3-2-1 with light rings, golden flash, bevelled metallic gold numerals pop in one by one, fireworks and gold dust |
| New Year Celebration | still from its own 3D scene | WebGL: two crystal flutes with golden champagne and bubbles rise, tilt, clink, sparkle; gold confetti falls |

Every card now ends with the existing Mawica ending (`mawica.`, `www.mawica.com`, "Send your feelings to others.", BRING YOUR WISHES TO LIFE., Create your own card, Read again), after the message, never over it.

## Architecture
- **Catalogue (no JavaScript, no three.js):** `CardArt` renders a plain lazy `<img>` with a two-size `srcset` per aspect ratio (16:10 in `/create`, 4:5 on the homepage gallery, 9:17 in the recipient showcase). 36 WebP files, 5–57 KB each, about 0.9 MB in total, in `public/art/catalogue/`. Produced by `scripts/render-catalogue.mjs`.
- **Cards:** `premium3d/stage/` is a shared shell (`Stage.tsx`: camera loop, reading sheet, ending, fallbacks) with one model module per card (`stage/cards/*.tsx`, one lazy chunk each). three.js loads only inside `StageCanvas` (dynamic, `ssr:false`), only when a 3D card plays. The recipient page still server-renders the message.
- **Message stays DOM text:** a plum glass sheet below the picture (the camera lifts the subject up with a view offset, so nothing overlaps the text); scrolls for long messages; Continue for the ending; short messages continue by themselves after a reading time.
- **Fallbacks:** no WebGL, context lost, render error or very low frame rate → the existing CSS scene (wrapped with the ending). Reduced motion → one static 3D frame, message visible at once.
- **Compatibility:** the six scene components were not modified; they are the fallbacks.

## How the thumbnails were made (and what is missing)
Each thumbnail is a rendered still of that card's own procedural 3D scene (real geometry, lights, materials) captured by headless Chrome. **There are no sculpted models or photographic textures.** The tree, box, window, numerals and glasses are built from primitives, lathes, extrusions and instanced geometry; they read as stylised 3D renders, not as the hero-quality render used for the snow globe. To reach that quality for the other five cards you need **sculpted models and a render pipeline** (Blender/Cinema 4D scenes, or an approved AI render per card) delivered as transparent WebP at the sizes above; the code already accepts files at those paths, so replacing a file replaces the thumbnail with no code change. Not available here: sculpted/PBR-textured models, HDR studio lighting, ray-traced glass and caustics, fur/needle simulation.

## Performance
Measured in headless Chrome with **software WebGL (SwiftShader)**, so frame rates are far below real GPUs and are only useful as relative guides. No real phone or GPU was tested.

| Check | Result |
|---|---|
| Homepage bundle (`/`) | 613.2 KB raw / 191.9 KB gzip (baseline 612.6 / 191.8): no regression |
| `/create` | 722.0 KB raw / 222.4 KB gzip (baseline 721.3 / 222.1) |
| Three.js in catalogue or landing bundles | none (enforced by `tests/stage.test.tsx`) |
| Catalogue thumbnails | 36 WebP files, 5-57 KB each, under 1.5 MB in total, lazy-loaded |
| Card page 3D chunk | about 233 KB (three + R3F), loaded only on a card page |
| Tree, desktop | FCP 1.74 s, first 3D frame 7.1 s, 3-4 fps (software), 29 draw calls, rendering stops after rest |
| Tree, mobile (4x CPU throttle) | FCP 1.68 s, 7-11 fps (software), DPR capped at 1.5 |
| New Year 2027, desktop / mobile | 12-17 fps / 31-53 fps (software) |
| Heap | about 10-12 MB |

Gift, Warm Wishes and Celebration were not re-measured after the final run. Their budgets follow the same shared shell: pause offscreen, a fallback below 14 fps, reduced motion shows a static frame.

## Tests
`tests/stage.test.tsx` (24: saved-card compatibility, no three.js in the catalogue or landing bundles, thumbnails exist for every card/ratio/size with the right aspect and sizes, camera sanity and smoothness for each scene on phone and desktop aspects, SSR message and ending for every card, fallbacks, reduced motion, resource release) plus the existing suites. Visual review: `docs/screenshots/catalogue/review/` (side-by-side per card and for the catalogue), `before/` and `after/` raw captures.

---

# Phase 2E.3: visual polish

Baseline `945f022`. No card IDs, routes, layout, wallet, scheduling or shared-stage behaviour changed. The snow globe is untouched.

## A real-device defect found and fixed

All light effects (star halo, candle and bulb glow, the gift's golden light, fireworks, gold dust) are drawn additively. The canvas used to be transparent over a CSS gradient. A software renderer shows additive colour over transparent pixels; a real GPU compositor drops it. Phase 2E.2 was only ever looked at through software WebGL, so on real hardware those effects were missing wherever they fell outside solid geometry. The scene now paints its own backdrop (`scene.background`, built from the same `STAGE_BACKDROP` definition as the CSS gradient), so the canvas is opaque and the effects render the same everywhere. Review and thumbnails are now rendered on the GPU (`GPU=1` on the scripts).

## Material and geometry changes

| Card | Geometry | Materials and light |
|---|---|---|
| Warm Christmas Wishes | Rebuilt. Arched opening 4.6 wide by 5.4 high in a wall with a 0.75 deep plaster reveal, recessed sash with glazing bars and a fan, outer casing, deep sill with apron. Outside: sky, crescent moon, two snowy mountain ridges, a snowfield, 30 instanced snow-laden pines (flanks and a far treeline), snowfall at three depths. Inside: four candles in brass holders, pine garland with berries, string lights draped around the arch on a wire, velvet curtains on a brass rod (desktop). | Frost only at the pane edges; faint additive reflection layer on the glass that strengthens as the room warms; cool moonlight through the opening against warm candle and room light; wall light pooled around the window; soft shadows under the sill, candles and beside the curtains (baked gradients, not shadow maps). |
| New Year Celebration | New tulip flute profile (spline lathe): thin foot, slender stem, bowl that narrows to the rim; separate thin rim ring; liquid follows the bowl. | Fresnel glass shader: nearly clear face-on, brighter at the silhouette, highlights survive transparency. Golden translucent champagne, fine bubbles rising in threads. The rims meet exactly (gap derived from the geometry), a small glint and 18 short sparks; confetti cut from 150 to 64 pieces, smaller, mostly gold. |
| A Special Gift | Box is now four walls and a floor (a real interior). Bow rebuilt from ribbon strips: two large and two small loops, knot, two tails. | Satin ribbon (low metalness, sheen) instead of mirror gold; the bands slacken, slip and fade; the lid stirs, rises and tips back without intersecting the box and carries the bow; interior gradient glow and a softer light column (about half the previous intensity). Second, tighter contact shadow that reacts to the float. |
| Magical Christmas Tree | Tiered cones and 3,600 identical needle cones replaced by about 900 boughs (two crossed serrated drooping blades each) in 21 whorls with per-bough length, pitch, roll and colour, plus side shoots; dark core cone. | Vertex shading dark at the trunk to bright at the tips (shadow between boughs); metallic clear-coated ornaments with gold caps; star with halo plus a rayed flare and a stronger light on the top boughs; camera starts low and rises. |
| New Year 2027 | Deeper bevel (8 segments), slightly deeper numerals. | Two golds (polished faces, deeper sides); fireworks are now a pure function of time (seekable, so thumbnails show the real show) at depths from 3 to 11 units, with a rising rocket, twinkle-out, a bloom of light per burst and a light that tints the numerals; the reveal flash is softer; low camera. |
| Snow Globe | None at the time; rebuilt as genuine 3D in Stage B (see `docs/snow-globe-stage-b.md`). | — |

## Can procedural geometry reach the required standard?

Partly. Stated plainly, card by card:

- **Glasses, 2027, gift:** hard-surface objects. Procedural geometry with PBR materials is adequate; what separates them from a product render is ray-traced refraction and caustics (glasses) and micro-surface detail (ribbon weave, paper grain). Those need either an offline render or baked textures.
- **Tree:** much better, still visibly stylised: boughs are blades, not needles. A sculpted GLB tree (about 60-100k triangles with baked normal and ambient-occlusion maps) would be the real fix.
- **Warm Christmas Wishes:** the outdoor view is illustrated (painted textures on planes plus simple pines); it reads as a storybook scene, not a photograph. To match the snow globe it needs either an approved pre-rendered backdrop plate for the view through the window (the 3D window, candles, lights and snow would stay live), or sculpted pines and a displaced terrain.
- **None of the five is photorealistic.** (The snow globe has since been rebuilt in 3D with authored models; see `docs/snow-globe-stage-b.md`.)

Assets that would lift the set: GLB tree, GLB pine (window), pre-rendered or painted landscape plate (window), baked normal/roughness textures for ribbon and wood, an HDR studio environment in place of the generated room environment.

## Performance (re-measured after the polish, production build)

Two sets, both headless Chrome. **No iPhone or Android device was tested, so real mobile performance is unverified.**

GPU (this Mac's GPU through Metal; "mobile" is a 390x844 viewport with 4x CPU throttling, not a phone GPU):

| Card | Desktop | Mobile viewport | Draw calls | Triangles (desktop / mobile) |
|---|---|---|---|---|
| Christmas Tree | 60 fps | 60 fps | 30 | 94.8k / 48.5k |
| Special Gift | 60 fps | 60 fps | 26-28 | 8.6k / 6.0k |
| Warm Wishes | 60 fps | 60 fps | 93 / 78 | 26.9k / 18.8k |
| New Year 2027 | 60 fps | 60 fps | 9-16 | 16.3k |
| Celebration | 60 fps | 60 fps | 17 | 44.4k / 27.8k |

First contentful paint 0.11-0.20 s, first 3D frame 1.6-1.8 s. All five drop to about 30 fps while reading and stop rendering after rest.

Software WebGL (SwiftShader, mobile viewport, 4x CPU throttle, performance guard bypassed): a floor for devices with no usable GPU.

| Card | During the animation | Reading |
|---|---|---|
| Christmas Tree | 10-21 fps | 20 fps |
| Special Gift | 27-36 fps | 30 fps |
| Warm Wishes | 14-21 fps | 20 fps |
| New Year 2027 | 30-58 fps | 30 fps |
| Celebration | 41-55 fps | 30 fps |

The tree and the window are the heaviest. The production guard is unchanged (below 14 fps the card switches to the CSS scene), so the tree's opening seconds on a software-only device would trigger the fallback. The tree's desktop triangle count roughly doubled (50.6k to 94.8k); the mobile count rose from 38k to 48.5k.

Bundles: `/` 613.2 KB raw / 191.9 KB gzip, `/create` 722.0 / 222.4, `/sign-in` 595.2 / 185.5: identical to Phase 2E.2. No three.js in catalogue or landing bundles. Card page JS 464-468 KB encoded, of which the 3D chunk is 233.5 KB. Heap 10-24 MB (the window is the largest because of its textures).

## Regression results

Unit and integration 425/425 (two new), saved-card compatibility 35/35, auth 66/66, wallet 51/51, scheduling 47/47, delivery worker 25/25, load and crash 20/20, premium card 47/47, cinematic journey 33/33, scheduling browser 83/83, account browser 27/27. TypeScript and ESLint clean.

`tests/media.test.ts` has a two-line fix for a calendar-dependent test (it cancelled at a fixed date and purged against the real clock); the same fix is on `chore/github-ci`.

## Review material

- `docs/screenshots/catalogue/review/`: before/after catalogue (desktop, mobile) and one sheet per card.
- `docs/screenshots/catalogue/recordings/`: real-time playback of all six cards, desktop and mobile, as animated WebP (6 fps capture, heavily compressed, so they look blockier and less smooth than the live card).
- `docs/screenshots/catalogue/after/`: opening, main, greeting and ending stills. The small stats line in the corner is the development overlay.

## Remaining visual limitations

- Nothing here is photorealistic; only the snow globe is. See "Can procedural geometry reach the required standard?".
- Window: mountains and pines are illustrated; the curtains are desktop-only (phones frame the window alone); shadows are baked gradients.
- Glasses: no refraction (the champagne is not distorted through the glass); the liquid surface tilts with the flute instead of staying level.
- Gift: the ribbon bands slip and fade rather than untie; no cloth simulation.
- Tree: boughs are serrated blades, not needles; no self-shadowing beyond vertex shading.
- 2027: numerals are built from arcs and bars, not a typeface.
- Reduced motion and the CSS fallback were re-checked by the compatibility suite, not re-reviewed by eye for every card.
