# Visual asset specification (7 scenes)

**Status: every asset in the repo is a temporary placeholder.** Nothing here is production artwork.
`src/content/hero.ts` (`isPlaceholder`) and `src/content/artwork.ts` (`status`) stay in placeholder mode
until final, approved art is supplied. The renderer already accepts the layers below; swapping artwork is
a config change, not a rewrite.

## Common rules
- **Formats:** WebP (preferred) or PNG with alpha for subjects; opaque WebP for backdrops. No SVG for photoreal art.
- **Colour:** sRGB. Brand palette anchors: Midnight Plum `#2A1B3D`, Rose `#D969A3`, Lavender `#9C7EDB`, Blush `#F7E6EF`, Ivory `#FFF8F4`, Gold `#F4C371`.
- **No baked-in effects:** no snow, sparkles, light glows, confetti, fireworks or text in the artwork. Those are animated by code on separate layers (so they can respond to taps, reduced motion and replay).
- **No baked-in text** (names, greeting, message). All text is live DOM for accessibility and personalisation.
- **Safe area:** the bottom ~42% of every card is covered by the greeting panel. Keep the subject in the upper ~55%.
- **Weight budget (mobile):** backdrop <= 180 KB, subject <= 250 KB, foreground <= 80 KB (WebP, quality ~80). Provide 2x only (the loader generates smaller sizes).
- **Loading:** backdrop and subject load with priority; foreground is lazy. A gradient + temporary subject is shown immediately, so there is never a blank frame.
- **Reduced motion:** the final composed frame (lights on, subject resolved) must look finished. Layers must not rely on motion to make sense.

## Config contract (`src/content/artwork.ts`)
```
backdrop   { src, width: 1080, height: 1920 }   opaque, full bleed, object-cover
main       { src, width, height, alt }           transparent, object-contain inside the art stage
foreground { src, width: 1080, height: 1920 }   transparent overlay, pointer-events none
lights     [{ x%, y%, size%, color: gold|rose, delay }]   code-painted glows over `main`
```
Hero uses `src/content/hero.ts` (`src`, `width`, `height`, `snowClip`, `lights`).

---

## 0. Homepage hero: Christmas snow globe
| | |
|---|---|
| Subject | Photorealistic glass snow globe on a base, miniature illuminated village and Christmas tree, realistic glass reflections, cinematic warm lighting |
| Layers | **main** only (transparent PNG/WebP, >= 2400 px wide, aspect ~ 600:680). Optional soft shadow baked under the base. |
| Not in art | snow, light glows, sparkles (code layers) |
| Code layers | snowfall clipped to the glass (`snowClip`), twinkling lights at `lights[]`, halo, float, pointer parallax (desktop), GSAP entrance (transforms only) |
| Timing | Entrance 1.3 s; snow continuous; lights twinkle 3.2 s loop; parallax depth 12 px |
| Interaction | Pointer parallax (fine pointers only) |
| Text | Headline/CTA sit beside (desktop) or above (mobile) the globe; art has no text |
| Visible before JS | Yes: artwork is server-rendered with `priority`; entrance only moves transforms |

## 1. Christmas Snow Globe (`snow-globe`), ~8 s

> Since Stage B (2026-11-24) this card is a genuine 3D model (`stage/cards/globe*`, `docs/snow-globe-stage-b.md`). The 2D timeline below now applies only to its fallback scene (no WebGL, lost context, low-performance devices).
| | |
|---|---|
| Layers | backdrop: deep plum night with soft bokeh (optional) / **main**: same globe as hero (reuse) / foreground: subtle vignette (optional) |
| Code | intro star + "A little magic for {name}" (0-3.2 s), globe rise (2.2 s), lights on (3.4 s), snow burst (3.4-6.6 s), greeting (5.4-8 s); tap = snow flurry |
| Readability | Greeting panel (blurred plum) over the lower area; message always visible at end |
| Reduced motion | Final frame: globe with lights, greeting visible, no snow burst |

## 2. Magical Christmas Tree (`christmas-tree`), ~8 s
| | |
|---|---|
| Layers | backdrop: dark teal/plum night room or forest, soft depth / **main**: tall tree (transparent; ornaments present but UNLIT/dull) / foreground: soft foliage or bokeh frame (optional) |
| Why unlit art | Lights are code-painted so they can switch on progressively from the base upwards. Mark light positions in `lights[]` (bottom first). |
| Code | tree fade (0.3 s), garland, ornaments light bottom-to-top (1.2-4.6 s), star flare (4.8 s), sparkles (4 s+), greeting (5.6 s); tap = sparkle burst |
| Reduced motion | Fully lit tree, greeting visible |

## 3. A Special Gift (`special-gift`), ~8 s
| | |
|---|---|
| Layers | backdrop: warm plum/rose glow room / **main**: TWO files needed: `gift-box` (closed-from-top box body) and `gift-lid` (lid + bow, separate transparent PNG so it can lift) / foreground: soft light flare (optional) |
| Note | The current config supports one `main` image; two-part gift art needs a small extension (`lid` layer). Raise before production. |
| Code | box enters (0.2 s), lid lifts and tilts (2.2 s), golden light rays (2.4 s), gold particle bursts (2.5-3.5 s), greeting (4.4 s); tap = more sparkles |
| Reduced motion | Open box with light, greeting visible |

## 4. Warm Christmas Wishes (`warm-wishes`), ~8 s
| | |
|---|---|
| Layers | backdrop: cosy interior, warm amber/rose gradient, shallow depth of field / **main**: window with night scene (transparent glass area is NOT needed; keep opaque scene) + candle on sill / foreground: warm bokeh lights (optional) |
| Code | string lights fade in and twinkle (0.4 s+), snow falls only inside the window (`clipPath`), candle flicker, greeting (3.2 s) |
| Reduced motion | Static scene, lights steady, greeting visible |

## 5. New Year 2027 (`new-year-2027`), ~8 s
| | |
|---|---|
| Layers | backdrop: near-black plum night with subtle gold haze or city skyline silhouette (opaque) / foreground: soft gold bokeh (optional). No `main` image: the focal point is live typography (5-4-3-2-1 then 2027). |
| Code | ring draws while counting (0.2-4.5 s), numerals 0.85 s each, 2027 pop (4.5 s), fireworks (4.7, 5.4, 6.0, 6.8 s), greeting (6.2 s); tap anywhere = firework at touch point |
| Reduced motion | Static ring + 2027 + greeting; no countdown, no fireworks |

## 6. New Year Celebration (`new-year-celebration`), ~8 s
| | |
|---|---|
| Layers | backdrop: midnight plum with gold light rays / **main**: two champagne flutes, transparent (slightly separated, ready to clink) / foreground: gold dust or bokeh (optional) |
| Code | rays spin (90 s loop), string lights, flutes tilt together (1.2 s) and clink with sparks (2.3 s), confetti (2.9 s and 5.2 s), greeting (4.2 s); tap = confetti |
| Reduced motion | Flutes together, greeting visible, no confetti |

## Delivery checklist (per asset)
Filename `scene-layer@2x.webp`, source file kept, alt text for `main`, measured light positions, size within budget, checked on a 320 px and a 390 px phone, approved by the brand owner before `status: "production"`.
