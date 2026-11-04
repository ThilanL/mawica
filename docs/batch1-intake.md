# Batch 1 artwork intake checklist

Approved: AI-generated artwork supplied externally. **No file below exists yet.** Do not substitute SVG or stock.
Source of truth: `src/content/artManifest.ts`. Validate drops with `npm run art:check` (checks format, exact
pixels, alpha, weight). The UI is not wired to these files until they are approved.

All files: **WebP, sRGB, delivered at 2x**, no baked-in text, snow, glows, sparkles or logos (code animates those;
the logo is a live brand file). Drop files at the exact paths below.

| ID | File (under `public/art/`) | Pixels | Alpha | Max KB | Used for |
|---|---|---|---|---|---|
| H1 | `hero/globe@2x.webp` | 2400x2720 (600:680) | yes | 320 | Hero glass globe, village, tree, rose-gold base. Soft contact shadow allowed. Base and glass edges cleanly cut out |
| H2 | `hero/plate-desktop@2x.webp` | 2880x1240 | no | 220 | Desktop hero background: ivory/lavender snowy scene, empty on the left (text area), detail on the right |
| H3 | `hero/plate-mobile@2x.webp` | 1170x1000 | no | 120 | Mobile portrait hero background, calm, globe sits over the centre-lower area, top 45% quiet for text |
| H4 | `hero/foreground-ornaments@2x.webp` | 1400x700 | yes | 120 | Snow bank, pine, baubles; bottom-right, desktop only |
| T1 | `cards/thumb-snow-globe@2x.webp` | 960x720 | no | 70 | Gallery: Christmas Snow Globe |
| T2 | `cards/thumb-christmas-tree@2x.webp` | 960x720 | no | 70 | Gallery: Magical Christmas Tree |
| T3 | `cards/thumb-special-gift@2x.webp` | 960x720 | no | 70 | Gallery: A Special Gift |
| T4 | `cards/thumb-warm-wishes@2x.webp` | 960x720 | no | 70 | Gallery: Warm Christmas Wishes |
| T5 | `cards/thumb-new-year-2027@2x.webp` | 960x720 | no | 70 | Gallery: New Year 2027 (no numerals baked in) |
| T6 | `cards/thumb-new-year-celebration@2x.webp` | 960x720 | no | 70 | Gallery: New Year Celebration (champagne flutes) |

Total 10 files, about 1.1 MB maximum. Opaque files must not contain any transparent pixels.

## Hero layer order (back to front)
0 plate (H2 desktop, H3 mobile) / 1 gradient fallback behind the plate (never blank) / 2 globe (H1) /
3 code layers (snow clipped to the glass, lights, halo) / 4 ornaments (H4, desktop only) / 5 live text and CTA.

## With each delivery, also send
- Alt text for H1 (one sentence).
- Globe measurements for H1: the glass circle (centre x%, y%, radius %) for the snow clip, and about 12 light
  positions (x%, y%, gold or rose). I can measure these from the image on receipt.
- Phone-safe check: on H3 the top 45% must be low-detail so the headline is readable without an overlay.
- Confirmation the files are original generations you may use commercially (no recognisable brands or people).

## Not in Batch 1
Phone showcase, closing scenery, bauble accent, scene backdrops and subjects (later batches, same manifest process).

## When files arrive (my steps)
1. `npm run art:check`, fix or reject any failure. 2. Measure H1 clip and lights. 3. Wire hero, then gallery.
4. Check no-JS, six widths, reduced motion, Lighthouse. 5. Owner approves, then flip `isPlaceholder` to false.
