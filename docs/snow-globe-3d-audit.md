# Christmas Snow Globe: 3D and AR upgrade, Stage A audit

Status: **Stage A (read-only audit), 2026-11-24.** No code changed. This file is the only addition and has not been committed. Stage B waits for approval and for the open decisions in section 9.

---

## 1. What exists today

### 1.1 The snow globe card is 2D. It has no 3D model at all.

| Piece | File | What it does |
|---|---|---|
| Template entry | `src/modules/templates/registry.ts` | `snow-globe` is one of the six **STANDARD** (free) launch cards: "A tiny glowing village, shaken into a snowy hush." |
| Scene map | `src/components/cards/scenes/index.ts` | `snow-globe` lazy-loads `premium3d/stage/entries/globe.tsx` |
| Entry | `premium3d/stage/entries/globe.tsx` | `withEnding(SnowGlobeScene)`. It is the only standard card **not** wrapped in `makeStage(...)`, so it never loads WebGL |
| Scene | `scenes/SnowGlobeScene.tsx` (95 lines) | One raster image (`heroArtwork.src` = `/art/hero/snow-globe-mawica.webp`, 1154×1310), a 2D `SnowCanvas` clipped to `circle(34% at 50% 42%)`, CSS beats (`.sg-*` in `globals.css`), tap = 3.2 s snow burst. `heroArtwork.lights` is empty, so the "lights on" beat does nothing |
| Ending | `stage/LegacyEnding.tsx` | Adds the shared Mawica ending and Continue button |
| Catalogue thumbnail | `public/art/catalogue/snow-globe-*.webp` (6 files) | `scripts/render-catalogue.mjs` builds these from the 2D artwork, **not** from a 3D render |
| AR | none | `arSupport.ts` `AR_KEYS = ["special-gift", "christmas-tree"]`, so the card page shows no View in AR button for the snow globe |
| Tests | `tests/stage.test.tsx:152`, `tests/regression.test.tsx` | Assert "the snow globe keeps its artwork". **These record the old decision and must be updated in Stage B.** |
| Docs | `docs/catalogue-3d.md` | States the snow globe was deliberately left as pre-rendered art because procedural 3D could not match it |

### 1.2 The 3D card engine, which the snow globe can join

The five other standard cards share a mature engine, and the snow globe can be added to it without changing the engine's design.

- **`Stage.tsx`**: renderer choice (`webgl` / `webgl-static` for reduced motion / `fallback-2d`), probes WebGL, falls back to the CSS scene on context loss or low FPS, IntersectionObserver and visibility pause, Skip intro, a DOM message sheet (real text, never drawn in WebGL), auto-advance, the ending, and dev hooks (`?cinemaT=`, `?bare`, `?zoom=`, `?perf`, `window.__cinemaSeek`).
- **`StageCanvas.tsx`**: r3f `Canvas` with an on-demand frame loop, `dpr [1, 1.5–1.75]`, adaptive DPR, a low-perf guard, ACES tone mapping, a PMREM `RoomEnvironment` (generated, not an HDRI), an opaque painted backdrop, fog and a stats meter.
- **Scene contract (`stage/types.ts`)**: `StageSceneModule = { def, Scene }`. `def.camera(t, aspect)` is a pure function, `heroT` is the thumbnail moment, `lift` keeps the subject above the message sheet. `Scene` receives only `{ shared, mobile, mode }`, so **it receives no personal text** (relevant to the rear engraving).
- **Pattern for shared web and AR geometry**: `tree-model.ts` holds layout and timeline as pure functions. The web scene (`cards/tree.tsx`) and the AR model (`ar/tree-ar.ts`) both build from it, with deterministic seeded randomness (`rng`). The snow globe should follow the same split.
- **Helpers to reuse**: `gfx.ts` (`gold()`, `glass()`, `starGeometry`, `shadowTexture`, `poolTexture`, `rng`, `dispose`), `tree-model.ts` (`frondGeometry`, `treeLayout`, `flareTexture`), `Particles.tsx` plus `ambient.ts` and `presets.ts` (camera-box snowfall; **not** suitable inside a sphere, see 4.4), `textures.ts` (`glowTexture`) and `ADD_LIGHT`.
- **Tap interaction precedent**: `LumiModel.tsx` writes `shared.current.celebrateAt` from an r3f `onPointerDown`. The snowstorm trigger can work the same way.

### 1.3 The AR pipeline, which can be reused almost entirely

| Piece | Reuse |
|---|---|
| `ArButton.tsx` | Unchanged. Covers WebXR, Quick Look, the desktop QR dialog (`/c/[slug]/qr.png`), in-app-browser help, the reader overlay and errors. It appears once the key is in `AR_KEYS` |
| `arSupport.ts` | Add `"snow-globe"` to `AR_KEYS` (and update `tests/ar-gift.test.ts:79`) |
| `ar/model.ts` | The `ArModel` contract (metres, Y up, base origin, `pose`, `clip`, `wish`, `light`) fits. Add a `buildArModel` branch. `PANEL_W/H` (0.28 × 0.36 m) are **global and larger than the globe itself**, so the wish panel needs a per-model scale |
| `ar/webxr.ts` | Hit-test placement, facing the viewer, contact shadow, tap on the wish card. The shadow plane is a fixed 0.62 m and should be sized per model |
| `ar/scene.ts` | The live wish panel and the single real light. Animated snow and storm need a per-frame hook the model provides (proposed: an optional `ArModel.live?(time, camera)`) |
| `ar/quicklook.ts` | Builds the USDZ on the phone and opens a `blob:` URL with the Quick Look banner. A heavier globe makes export on the phone slower; see 6.3 |
| `ArLab.tsx` / `/lab/ar` | Exports GLB and USDZ (animated and still), reloads them and reports size, triangles and `minY` grounding. `/usr/bin/usdchecker` is on this Mac for `--arkit` validation |
| `public/ar/*.glb/usdz` | Generic, non-personal files per card. Current sizes: tree 1.1 MB GLB / 3.4 MB USDZ (already over the 3 MB budget in `ar-feasibility.md`) |

### 1.4 Homepage hero (must stay untouched)

- The hero is now `landing/cinematic/*` with `src/content/celebrations.ts`: three looping AI-generated videos (Christmas, Birthday, Wedding) with posters. The approved 3D-looking globe in the hero is **video, not a model**.
- `src/content/hero.ts` `heroArtwork` (the bronze-base still) is shared by the hero fallback **and** the current `SnowGlobeScene`. To leave the hero unaffected, the new card must not edit `hero.ts`, `HeroArtwork.tsx`, `SnowCanvas.tsx` or the hero CSS. The card only reads from them.

---

## 2. Reusable assets

| Asset | Path | Use in the new card |
|---|---|---|
| **Christmas hero poster** | `public/art/hero/videos/christmas-poster.webp` (1600×900) | **Main visual reference** (see 3.1). Read only, never shipped inside the model |
| Christmas hero video | `public/art/hero/videos/christmas.mp4` (8 s) | Reference for rear and side views, smoke, star glow and snow motion |
| Transparent globe still | `public/art/hero/snow-globe-mawica.webp`, `globe@2x.webp` | Secondary reference (interior density, glass highlights). Stays as the 2D fallback until a 3D-rendered fallback still exists |
| Mawica wordmark | `public/brand/mawica-mark.png` (2000×560, letters only) | Gold logo on the base front, used as an alpha mask for a gold or emissive decal. Brand rule: **"Never restyle or recreate"**, so it is never rebuilt as 3D text |
| Site fonts | `--font-fraunces`, `--font-jakarta` (already read by `ar/scene.ts` `fonts()`) | Rear engraving and wish texture |
| Wish layout | `ar/wish.ts` (`layoutWish`, `capText`, RTL handling, unit-tested) | Engraving text and AR wish panel |
| Tree geometry | `tree-model.ts` (`frondGeometry`, instanced boughs, ornaments, garland, star) | Starting point for the central tree and background pines. It is the best foliage in the codebase, though still blade-based |
| Materials | `gfx.ts` `gold()`, `glass()`, `satin()` | Starting points. Gold needs a brushed variant; glass needs transmission (see 4.2) |
| Music | `CardMusicPlayer.tsx` plus `modules/music` | Existing mute control. A snowstorm chime would be a new, optional asset |

**Missing assets:** no GLB or 3D models anywhere in the repo, no HDRI, no PBR texture sets (wood, snow, lacquer), no vector (SVG) logo, no Blender or DCC install, and no glTF compression tool.

---

## 3. Visual differences: current card vs reference

### 3.1 First, the two "reference" images disagree

The brief's description (deep-red lacquered base, gold snowflakes and filigree, a single cottage with smoke, snowman with red scarf, reindeer, black street lantern, red and gold presents) matches the **Christmas hero video and poster**. It does **not** match `snow-globe-mawica.webp`, the still the card shows today, which has a bronze base, two cottages, a stone bridge, a river, villagers and no snowman, reindeer or lantern.

**Proposal:** treat `christmas-poster.webp` and `christmas.mp4` as the visual reference. See decision D1.

### 3.2 Gap list (current card → target)

| Area | Current card | Reference (poster) | Gap |
|---|---|---|---|
| Medium | Flat raster with a 2D snow overlay | — | Everything: geometry, materials, lighting, camera |
| Base | Bronze/copper, plain, wordmark | Deep red lacquer band, polished gold upper and lower rims, gold snowflakes with scroll filigree either side of the logo | New base profile and decoration |
| Glass | Painted highlights | Thick clear sphere, bright rim (Fresnel), soft window reflection, slight refraction of the interior | Physical glass material |
| Interior | Two cottages, bridge, river, figures | One log/timber cottage with a deep snow roof, brick chimney with smoke, lit windows, porch steps; large tree with red and gold ornaments and a star; 3–4 snowy pines; snowman; reindeer; black Victorian lantern; two red presents with gold ribbon | All new content |
| Lights | `lights[]` empty, so nothing twinkles | Warm windows, lantern, tree lights, star flare | Emissives, bloom and light variation |
| Snow | 2D canvas clipped to a circle | Fine flakes inside the glass, a few sparkles | 3D particles held inside the sphere, with storm and settling |
| Depth | None | Full 3D, viewable from all sides | Required: the rear has to be modelled too (cottage back, tree back) |
| Personalisation | DOM greeting sheet | — | Golden reveal plus engraving on the rear of the base |
| AR | None | — | Android and iPhone |

---

## 4. Proposed geometry and material architecture

### 4.1 Units and physical scale (shared by web and AR)

Model in metres so the web scene and AR share one model (`globe-model.ts`). The web camera frames it with `fitDistance`.

| Dimension | Target | Model |
|---|---|---|
| Overall height | 22 cm | 0.220 m, from base underside to the top of the glass |
| Globe diameter | 18 cm | Sphere radius 0.090 m, wall about 4 mm (outer 0.090, inner 0.086) |
| Base diameter | 17 cm | Widest point at the bottom gold foot, r = 0.085 |
| Base height | — | About 0.055 m (foot rim 8 mm, red band 36 mm, upper rim 11 mm) |
| Sphere seat | — | Sphere centre at y = 0.130, so it sinks about 2 cm into the collar (0.130 + 0.090 = 0.220) |
| Grounding | Must not float | Origin at the centre of the base underside, `minY == 0` asserted in tests (same check as `ArLab`'s `minY_m`) |

### 4.2 Exterior

| Part | Geometry | Web material (desktop / mobile) | AR material |
|---|---|---|---|
| Glass shell | Outer and inner `SphereGeometry` (64×48 desktop, 40×28 mobile), open at the bottom where the collar hides it | `MeshPhysicalMaterial` with `transmission: 1`, `thickness: 0.004`, `ior: 1.5`, `roughness: 0.02`, plus `envMap`. **Mobile:** no transmission; transparent with Fresnel-weighted opacity and clearcoat reflections (transmission costs an extra full-screen pass) | Android: same as web mobile. iPhone: `UsdPreviewSurface` opacity of about 0.12, roughness 0.05, single sided with real inner faces (no refraction in Quick Look) |
| Snow surface inside | Displaced disc (heightfield) cut by the inner sphere, a "snow bowl" that seals the bottom of the interior | Snow PBR: white base, normal and roughness maps, mild subsurface tint | Baked albedo plus AO |
| Base | One `LatheGeometry` from a profile curve (foot bead, cove, band, collar bead) with separate material groups | Red lacquer: `MeshPhysicalMaterial` `#8e0f14`, clearcoat 1, clearcoat roughness 0.05, roughness 0.35, subtle flake normal | `UsdPreviewSurface` with clearcoat (supported) |
| Gold rims | Torus and lathe beads | Polished gold: metalness 1, roughness 0.12, plus a brushed variant (anisotropy on desktop) | Metallic 1, roughness 0.2 |
| Snowflakes and filigree | Desktop: extruded `Shape` snowflakes (6-fold, about 300 tris each, instanced ×4–6), filigree as a raised decal: a band texture carrying normal, metalness and roughness, wrapped on the cylinder | Gold over red via masks in one band material, which saves draw calls | Same baked band texture (base colour plus metallic) |
| Mawica logo (front) | Decal on the band (UV-mapped cylinder segment) from `mawica-mark.png` used as an alpha mask | Gold metal on the mask, a slight emissive lift so it reads at night | Baked into the band's base colour and metallic textures |
| Rear engraving | Same band, back half: personal text drawn into a canvas mask at runtime | Gold engraved letters (normal plus metal mask) | Personalised texture swap (see 6.3) |

### 4.3 Interior (fits inside an inner radius of 0.086 m, floor at about y = 0.105)

Each item lists its source in order of preference (decision D2). Target triangle counts are for desktop; mobile and AR use LODs.

| Item | Build | Detail target |
|---|---|---|
| Cottage | **Authored GLB** (preferred) or procedural: timber walls from instanced logs (cylinder plus end-grain cap), window frames and mullions, door with panels, gable roof as extruded slabs, porch steps | 8–15k tris; wood albedo, normal and roughness maps; window glass as an emissive warm interior card |
| Roof snow | Procedural: an offset and inflated roof mesh with noise-displaced overhang lips and drips | 2–4k tris, same snow material |
| Chimney | Procedural: box with an instanced brick texture (normal map) and a cap | Under 500 tris |
| Smoke | Web: about 40 soft billboard sprites on a curl-noise path, rising and fading (`depthWrite: false`, normal blending, not additive, to avoid glow). AR iPhone: omitted, or 3–4 grey spheres scale-animated | Animated |
| Central tree | Upgrade `tree-model.ts`: keep the instanced boughs, add a needle-card alpha texture (cross-quads per bough) for real silhouettes, snow tufts on the upper faces | Desktop about 40k tris instanced; mobile about 15k |
| Ornaments | Instanced spheres (red and gold, metallic and clearcoat) with caps | 30–40 |
| Tree lights | Points with glow plus an emissive bead mesh, twinkle by per-instance colour | 80–120 |
| Star | Reuse `starGeometry` plus `flareTexture` sprite; emissive, bloom-selective | — |
| Background pines | Same tree generator at lower density, snow-heavy colour, instanced ×4 | Under 6k tris each |
| Snowman | Procedural is fine: three slightly squashed displaced spheres, coal eyes and buttons (instanced), carrot nose (cone), stick arms (tube), red knitted scarf (tube along a curve plus knit normal map), hat (lathe) | About 6k tris |
| Reindeer | **Authored GLB required** for quality: organic anatomy cannot be credibly procedural | 5–10k tris, painted texture, antlers |
| Street lantern | Procedural lathe post, base, cage arms, glass panes, finial; emissive bulb plus one real point light (desktop) | About 4k tris |
| Presents | Reuse `RoundedBoxGeometry` presents (red satin, gold ribbon) from `tree-model.ts` with a bow | ×3 |
| Ground | Snow heightfield with path and footprints in the normal and AO maps (two trails: door to lantern, presents to snowman) | 1 mesh |

Draw-call strategy: merge static meshes by material (`mergeGeometries`), instance repeats (logs, bricks, snowflakes, ornaments, pines, lights), one atlas for small props.

### 4.4 Lighting and rendering

- **Environment:** a small CC0 HDRI (for example a Poly Haven studio or night scene, 1k `.hdr`, about 1.5 MB, or a 512 px version) through PMREM. It replaces `RoomEnvironment` **for this card only**; the other cards keep the generated environment.
- **Lights:** one warm key (spot from above front), one cool rim (moonlight back-left), cottage interior point light (desktop), lantern point light (desktop), star point light. Mobile drops to key, rim and star only, and relies on emissives.
- **Shadows:** one shadow-casting light inside the globe only (small 1024 map, frozen after the first frame since the interior is static), plus the existing baked contact shadow under the base. Mobile: baked AO only.
- **Ambient occlusion:** baked into textures (GLB assets) and vertex AO for procedural parts. Screen-space AO is too expensive for mobile.
- **Bloom:** selective, desktop only (star, window glow, lantern, tree lights), with a low threshold and low intensity, as the brief asks ("no excessive glow"). This needs `postprocessing` or three's `UnrealBloomPass`; the codebase uses neither yet. Alternative: keep the existing sprite-glow approach (no post), which is cheaper.
- **Tone mapping:** keep ACES; consider `AgXToneMapping` for truer reds.

### 4.5 Snow inside the glass

- A custom `ShaderMaterial` points system with 600 particles on desktop, 300 on mobile and 200 in AR (Android).
- Each flake carries seeded constants (spawn position inside a sphere of r 0.080, size, phase, drift). Its position is a **pure function of time and the last storm time** (a closed-form fall, sway and swirl decay). Thumbnails and `cinemaT` seeking therefore keep working, which matches how the engine already treats every animation.
- **Containment:** positions are wrapped into the inner sphere in the vertex shader (reflect at r > 0.082), so no flake can ever exit the glass. Flakes below the snow floor rest on it, then respawn up top over time.
- **Storm:** a tap on the glass (r3f `onPointerDown`) or a device shake sets `shared.stormAt`. Velocity becomes a swirl (tangential vortex plus upward kick) decaying over about 6 s, and the flakes settle.
- **Shake detection:** `devicemotion` acceleration magnitude above a threshold with a debounce. iOS 13+ requires `DeviceMotionEvent.requestPermission()` from a user gesture, so offer a small "Enable shake" control on iPhone; Android needs no permission.

### 4.6 Animation timeline (about 11 s intro, like the other cards)

0–2 s: camera rises from the base (logo) to the glass. 2–5 s: windows, lantern and tree lights come on in sequence. 5–6.5 s: star ignites. 6–9 s: an automatic gentle storm that settles. 9–11 s: slow orbit settles three-quarters front, and the golden greeting reveal starts. Ambient after that: twinkle, smoke, light flicker of ±5% on a slow noise, idle snowfall. Reduced motion: `webgl-static` at the end pose with snow frozen and no smoke.

### 4.7 Quality profiles

| | Desktop | Mobile web | Android AR | iPhone USDZ |
|---|---|---|---|---|
| Triangles | ≤ 250k | ≤ 90k | ≤ 60k | ≤ 40k |
| Draw calls | ≤ 70 | ≤ 40 | ≤ 35 | n/a (one node per material) |
| Textures | ≤ 2048 (band 2048×512) | ≤ 1024 | ≤ 1024 | ≤ 1024 PNG/JPEG |
| Glass | Transmission | Fresnel transparent | Fresnel transparent | Opacity |
| Bloom | Selective | Sprites only | Sprites only | None |
| Shadows | One frozen map | Baked | Baked plus floor blob | Quick Look's own |
| Snow | 600 | 300 | 200 | About 40 keyframed flakes or none |
| Smoke | 40 sprites | 20 sprites | 12 sprites | None or 3 scale-animated puffs |
| DPR cap | 1.75 | 1.5 (existing) | 2 (existing) | n/a |

---

## 5. Asset creation requirements

| # | Asset | Format and budget | Source |
|---|---|---|---|
| A1 | Cottage (incl. rear, porch, steps, windows as separate material) | GLB, ≤ 15k tris, 1024² atlas (albedo, ORM, normal) | Authored in Blender, commissioned, or a licensed CC0/CC-BY model, restyled |
| A2 | Reindeer | GLB, ≤ 10k tris, 1024² | Same; must be licensable for commercial use |
| A3 | Optional upgrade: sculpted fir tree | GLB, ≤ 60k tris, needle alpha cards | Same. Otherwise the upgraded procedural tree |
| A4 | HDRI environment | 1k `.hdr` or `.exr` | Poly Haven (CC0) |
| A5 | PBR textures: wood logs, brick, snow, red lacquer flake | 1024², JPEG/PNG | ambientCG / Poly Haven (CC0) |
| A6 | Base band texture (snowflakes, filigree, logo placement) | 2048×512 masks (gold, normal) | Drawn procedurally in canvas (no file) or designed in Figma; **an SVG of the wordmark would give a crisper logo** than the 2000×560 PNG |
| A7 | Optional snowstorm chime | ≤ 40 KB `.m4a`/`.ogg` | Licensed or original |
| A8 | Fallback still and catalogue thumbnails | WebP at existing sizes | Rendered from the finished 3D scene in Stage F (`render-catalogue.mjs` path used by the other five) |

Compression: `GLTFExporter` writes uncompressed glTF. three already ships `meshopt_decoder` and `draco` decoders under `examples/jsm/libs`, but there is **no build-time compressor** (`gltf-transform` is not installed). Adding it as a devDependency is proposed for Stage F.

Downloads (HDRI, textures, models) need your approval per file; see decision D2.

---

## 6. AR compatibility limitations

### 6.1 Android (WebXR, three.js renderer)

- Almost everything works, since it is our own renderer: glass, emissives, the real light, snow points, smoke sprites, the storm on tap (tap on the globe via the existing `select` raycast, the same mechanism as `tapCard`).
- **Transmission in XR** is expensive on phone GPUs (an extra pass every frame at camera resolution), so AR uses Fresnel-transparent glass.
- **Shake in AR** is not reliable: the phone moving is how the user looks around. In AR the storm is tap-only.
- Additive glow over a bright camera feed washes out (already noted in `ar-feasibility.md`), so AR uses low-intensity normal-blended halos.
- The wish panel (0.28 × 0.36 m) is larger than the 22 cm globe. Proposal: about 0.16 × 0.21 m, hovering beside and in front of the globe after the intro.

### 6.2 iPhone (AR Quick Look, USDZ)

| Feature | Quick Look | Plan |
|---|---|---|
| Transparent glass | Opacity supported; no refraction or transmission; sorting of nested transparent surfaces can be wrong | Single glass layer, opacity of about 0.12, inner faces as real geometry, nothing else transparent inside |
| Red lacquer and gold | `UsdPreviewSurface` metallic, roughness and clearcoat supported | Bake AO and lighting into base colour |
| Emissive windows, lantern, star | Emissive colour supported (no bloom, no lights) | Bake glow halos into textures where needed |
| Snowfall | No particles; transform keyframes only | About 40 instanced flake meshes on a looping keyframe path (each extra animated node adds USDZ size), **or** a static "settled" globe. Decision D5 |
| Smoke, twinkle, light variation | No opacity or colour animation | Omit smoke; twinkle by scale pulses (as in `tree-ar.ts`) |
| Storm / shake | No interaction, no scripts | Not available on iPhone; say so in the overlay copy |
| Personal greeting | Text must be baked into a texture | Existing wish panel (reduced) plus rear engraving texture |
| Reduced motion | Ignored by Quick Look | Still USDZ (existing pattern) |
| Size | Practical ≤ about 5 MB for a smooth open | Current tree USDZ is already 3.4 MB; the globe is denser, so needs LODs and texture budgets |

### 6.3 Personalised USDZ: build time on the phone

Today the phone rebuilds the whole model and runs `USDZExporter` on every view. For a model this detailed that may take seconds and a lot of memory on older iPhones. **Proposal:** build a generic, non-personal USDZ once at build time (via `ArLab`, as now). On the phone, only **swap the two personal PNG textures** (engraving and wish panel) inside the USDZ archive. A USDZ is an uncompressed zip with 64-byte-aligned entries, so the phone repacks it without re-exporting any geometry. The fallback is the full on-phone export, then the generic unpersonalised file. Nothing personal is uploaded or stored (same privacy model as today).

### 6.4 Placement

Origin at the base underside and `minY = 0` gives correct grounding in both viewers. Quick Look places at real scale with its own contact shadow; Android uses the hit-test pose plus our blob shadow (to be resized to about 0.26 m).

---

## 7. Proposed implementation files

**New**

```
src/components/cards/premium3d/stage/cards/globe-model.ts   # pure: dimensions (m), base profile, interior layout, timeline, snow maths (shared web + AR)
src/components/cards/premium3d/stage/cards/globe.tsx        # StageSceneModule: def (camera, heroT, lift) + Scene
src/components/cards/premium3d/stage/cards/globe/
  glass.ts        # shell geometry + per-profile glass material
  base.ts         # lathe base, rims, snowflakes, band texture, logo decal, rear engraving
  village.ts      # cottage/reindeer loaders (or procedural), roof snow, chimney, snowman, lantern, presents, ground
  trees.ts        # central tree + pines (builds on tree-model.ts)
  snow.ts         # in-globe particle shader (containment, storm, settle)
  smoke.ts        # chimney smoke sprites
  textures.ts     # canvas-generated masks (band, engraving, footprints)
  profiles.ts     # desktop / mobile / ar quality profiles
src/components/cards/premium3d/ar/globe-ar.ts               # ArModel for the snow globe
src/components/cards/premium3d/ar/usdz-swap.ts              # personal-texture swap in a prebuilt USDZ (6.3)
public/models/snow-globe/*.glb                              # authored assets (if D2 = authored)
public/env/snow-globe-1k.hdr                                # HDRI
public/ar/snow-globe(.glb|.usdz|-still.*)                   # generic AR files
tests/globe.test.ts                                         # scale, grounding, containment, determinism, budgets
docs/snow-globe-3d.md                                       # results doc (replaces this audit at the end)
```

**Changed (snow globe only)**

| File | Change |
|---|---|
| `stage/entries/globe.tsx` | `makeStage("snow-globe", withEnding(SnowGlobeScene))`, so the current 2D scene becomes the fallback |
| `stage/loaders.ts` | Add `snow-globe` loader and backdrop |
| `stage/Stage.tsx` | `STAGE_DURATION["snow-globe"]`; pass personal text to the scene (optional prop) for the engraving; golden-reveal class for this card |
| `stage/types.ts`, `rig.ts` | Optional `text` on `StageSceneProps`; `stormAt` on `Shared` (or reuse `celebrateAt`) |
| `StageCanvas.tsx` | Optional per-card environment (`def.env`), with the default unchanged for the other cards |
| `ar/model.ts`, `ar/scene.ts`, `ar/webxr.ts`, `ar/quicklook.ts` | `snow-globe` branch; optional per-model panel scale, shadow size and `live()` hook. Gift and tree behaviour stays the same |
| `arSupport.ts` | `AR_KEYS` gains `"snow-globe"` |
| `app/globals.css` | `.stg-*` golden reveal modifier scoped to the snow globe |
| `scripts/render-catalogue.mjs` | Render the snow globe from 3D like the other five |
| `tests/stage.test.tsx`, `tests/ar-gift.test.ts` | Update the two assertions that encode the old decisions |

**Not touched:** `src/content/hero.ts`, `src/content/celebrations.ts`, `components/landing/**`, `public/art/hero/**`, the other five cards' scene and model files, `registry.ts` (unless D3 changes the tier), and the database or Prisma schema (unless D4 = separate engraving field).

---

## 8. Development and validation plan

| Stage | Work | Validation |
|---|---|---|
| **B** Static model and materials | `globe-model.ts`, glass, base, interior, quality profiles; static render only | Unit: dimensions, `minY = 0`, interior within the inner radius, deterministic layout. Visual: `?cinemaT=` and `?zoom=` stills at front, rear, both sides, top-down at 45° and a close-up of the base logo, on desktop and mobile viewports in the browser pane; `?perf` stats against the profile budgets |
| **C** Lighting and animation | Lights, HDRI, bloom or sprites, snow shader, storm (tap and shake), smoke, twinkle, intro choreography, reduced motion | Unit: snow never leaves r < 0.086 over 10k sampled frames and storm ages; storm decays to rest; reduced motion means a static frame. Visual: frame strip at t = 0, 3, 6, 9, 11 s and after a tap. Perf: FPS and draw calls via `Meter`, low-perf fallback still triggers |
| **D** Personalisation | Golden reveal, rear engraving from props, no hard-coded text | Unit: long, RTL and emoji names through `layoutWish`; engraving clamps. `renderToStaticMarkup` still contains the greeting (no-JS path) |
| **E** AR | `globe-ar.ts`, generic GLB and USDZ, personal texture swap, Android live scene | `/lab/ar?key=snow-globe` report (size, triangles, `minY`); `usdchecker --arkit`; reload the GLB in three; **real-device checks on your Android (ARCore Chrome) and iPhone (Safari)**. I can't run those here; they need you or a device lab |
| **F** Optimisation and thumbnail | LODs, texture budgets, optional `gltf-transform` meshopt, lazy-load audit, catalogue and fallback renders | Bundle check: homepage and catalogue chunks contain no three or globe code; `catalogue-compare.mjs` before/after sheet; mobile throttled FPS; `npm test`, `npm run lint`, `tsc` |

---

## 9. Decisions needed before Stage B

| # | Decision | Recommendation |
|---|---|---|
| **D1** | Which image is the reference? The brief's description matches the **Christmas hero video poster** (red base, snowman, reindeer, lantern), not the bronze-base still the card uses today | Poster and video |
| **D2** | How organic models are made. Procedural code alone (like the other five cards) will look like a high-end stylised render, not "ultra-realistic": the cottage can get close, the reindeer cannot. Options: (a) you supply or commission GLBs for the cottage and reindeer (A1–A2); (b) I source CC0/commercially licensed models and textures (each download needs your OK); (c) fully procedural, accepting stylised realism | (a) or (b) for the cottage and reindeer plus CC0 HDRI and textures; procedural for everything else |
| **D3** | Tier. `snow-globe` is a **free STANDARD** card; the brief calls it a "flagship premium" card. Making it premium changes wallet and credit behaviour for an existing launch card | Keep the key and tier, and upgrade in place. A premium tier can follow later as a separate key |
| **D4** | Rear engraving text. There is no engraving field today | Derive it from existing fields ("For {recipient} · with love, {sender} · Christmas 2026"), so no schema or wizard change. A separate optional field would need a migration and a wizard step |
| **D5** | iPhone snow. Keyframed flakes add file size and keep the look busy | About 30–40 flakes, gently looping, plus a static still for reduced motion |
| **D6** | Bloom. Post-processing would add a dependency (`postprocessing`) or three's `UnrealBloomPass` | Desktop-only `UnrealBloomPass` (no new dependency), selective, low intensity |
