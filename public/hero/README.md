# Hero artwork

Replace `snow-globe-placeholder.svg` with the final render:

- Transparent PNG or WebP, 2400 px wide minimum (3:3.4 aspect or update `width`/`height`), globe + base only.
- No snow, sparkles or light glows baked in: those are separate animated layers.
- Then edit `src/content/hero.ts`: `src`, `alt`, `width`, `height`, `isPlaceholder: false`,
  `snowClip` (CSS clip-path enclosing the glass) and `lights[]` (percent positions of tree/window lights).
- The same artwork and config drive the landing hero, the "Watch the Magic" preview and the recipient card.
