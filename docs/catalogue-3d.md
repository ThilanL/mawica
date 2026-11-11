# Standard cards in 3D: catalogue and card redesign (Phase 2E.2)

Local only: nothing is deployed. Card names, template ids, the catalogue grid, navigation, wallet and scheduling behaviour are unchanged; saved cards render in the new scenes through the same URLs.

## What changed
| Card | Catalogue thumbnail | Full card |
|---|---|---|
| Christmas Snow Globe | the **existing approved pre-rendered globe** (`public/art/hero/globe@2x.webp`) composed on the plum backdrop | unchanged scene (that artwork already matches the brief better than a procedural globe could) + the shared Mawica ending |
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
