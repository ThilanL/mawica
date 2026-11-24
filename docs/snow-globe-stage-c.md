# Christmas Snow Globe: Stage C report (lighting, snowfall and interaction)

> Screenshots referenced in this report live in `docs/screenshots/snow-globe/`, which is kept locally and not committed (regenerate with `scripts/globe/render-gallery.mjs`).

Status: **2026-11-24. Stage C is complete and waiting for approval.** Nothing is committed, pushed or deployed. Stage D (personalised engraving and golden message reveal) has not started.

## 1. What was added

| Feature | How it works |
|---|---|
| **Snowfall inside the glass** | 650 flakes on desktop, 380 on phones (drawn 45% larger so they read on a small screen). Each falls down its own column with a gentle sway, fades in near the top and settles into the snow at the bottom. About 12% are glitter flakes that catch the light |
| **Snowstorm** | A tap on the globe, or a real shake of a phone, whips the snow into a swirling vortex that slows and settles back to calm snowfall over about 10 s. The intro plays one gentle flurry at 6.2 s. During a storm the card keeps its full frame rate |
| **Snow stays inside** | Positions are pure functions of time, computed on the CPU each frame (one source of truth). Every flake's column and its vortex point are inside the glass, and blending between them stays inside because a sphere is convex. Tests sample 400 flakes over 120 s and 8 storm ages: no flake comes within 2 mm of the glass or sinks below the snow |
| **Chimney smoke** | 30 soft puffs (20 on phones) rise from the chimney, drift, widen and fade. They start once the windows are lit |
| **Village lights intro** | 0–11 s: windows (1.2–2.4 s), the lantern with a little stutter (2.0–2.8 s), the garland chasing up the tree (2.6–5.0 s), then the star (5.0–6.4 s), while the camera rises to the hero view |
| **Ambient light** | Garland lights twinkle at their own rates (55–100%). The star breathes (85–100%) and turns gently. Cottage windows and the lantern flicker ±5% |
| **Bloom (desktop only, D6)** | Selective. Only true light sources glow: star, windows, lantern, garland. Every other material is capped just below the bloom threshold, so glass and gold reflections and lit snow never bloom (after tone mapping the cap is invisible). **Adaptive:** if the GPU can't hold about 50 fps with bloom, it switches off for the visit and the glow halos remain. Phones never load it |
| **Sound (optional)** | A "Sound off / Sound on" toggle, off by default. With sound on, a tap or shake plays a soft glass-and-bells shimmer synthesised with Web Audio, with no audio file. The card's music player is unchanged |
| **Hint** | Under the message: "Tap the globe, or shake your phone, for a snowstorm" |
| **iPhone shake** | iOS only reports motion after the person allows it from a tap, so the first tap on the globe both starts a storm and asks for motion access. Android needs no permission |
| **Reduced motion** | The engine's existing still mode: the finished, fully lit scene with snow and smoke frozen. No storm, no hint, no sound toggle |

The hint and sound toggle are scoped to the snow globe (`STAGE_INTERACTIVE` in `Stage.tsx`). The other five cards render exactly as before.

## 2. Review frames

All images are screenshots of the working card, in `docs/screenshots/snow-globe/stage-c/`.

| File | Shows |
|---|---|
| `c01-intro-0.5s.webp` to `c04-intro-6.0s-star.webp` | The intro: dark village, then windows, garland and star |
| `c05-storm-0.6s.webp`, `c06-storm-3s.webp`, `c07-storm-8s-settling.webp` | A snowstorm swirling up and settling |
| `c08-calm-snowfall-smoke.webp` | Calm snowfall and chimney smoke (close-up) |
| `c09-reduced-motion.webp` | Reduced-motion still |
| `c10-no-bloom-compare.webp` | Bloom off, for comparison with c06 |
| `c11-mobile-storm.webp` | Phone quality during a storm |

Live: with the dev server running, `http://localhost:3010/lab/card?key=snow-globe` (the real card), or `/lab/globe` (360° viewer; tap to make it snow; `?t=`, `?storm=`, `?still`, `?nobloom`).

## 3. Card behaviour (checked in headless Chrome on the real card route)

| Check | Result |
|---|---|
| Phone (430×900 at 2×), intro | WebGL, 60 fps, 68 draw calls, 116k triangles, hint and sound toggle shown |
| Phone, reading, at rest | About 31 fps: the engine's existing idle rate |
| Phone, after a tap on the globe | Back to 60 fps for the storm (the storm keeps the card awake while it settles) |
| Desktop (1440×900 at 1.75×) | 130 draw calls including the bloom passes, 311k triangles drawn (glass refraction pass included) |
| Bloom cost, lab at desktop size | 47 fps with bloom, 58 fps without (headless GPU). The adaptive guard turns bloom off below about 50 fps |
| Reduced motion (emulated) | `webgl-static`, finished scene, no hint or toggle, renders only when asked |
| Personal message sheet | Unchanged: "For Nadia / Merry Christmas / With love, Sam", Continue, ending |

These numbers come from an Apple M5 Mac running headless Chrome. **I haven't tested on a real phone.** Shake detection, the iOS motion prompt and the sound on device all need checking on your iPhone and Android in Stage E/F.

## 4. Tests

| Check | Result |
|---|---|
| `tests/globe.test.ts` | 32 tests pass. Stage C adds:<br>• snow is deterministic<br>• **no flake leaves the glass or sinks below the snow**, calm or in any storm phase<br>• the storm rises in 0.4 s, is under 2% by 12 s and exactly 0 at 15 s<br>• zero storm energy gives exactly the calm path<br>• smoke stays inside and fades<br>• lights come on in order and are all on at the end of the intro<br>• flicker, twinkle and star stay within their stated ranges<br>• interaction is scoped to the snow globe, sound is off by default, bloom is desktop only, and the sound is synthesised (no file) |
| `tests/stage.test.tsx` | Pass |
| Full suite | **547 passed, 26 failed.** The same 26 pre-existing `LEDGER_DRIFT` failures in `delivery.test.ts` and `scheduling.test.ts` that also fail on a clean checkout of HEAD (Stage B report). Nothing in wallet, credits or the database was touched |
| `tsc --noEmit` | No errors in project files |
| `eslint src tests scripts` | 0 errors, the 2 pre-existing warnings in `tests/email-resend.test.ts` |

## 5. Files

**Added**
- `src/components/cards/premium3d/stage/cards/globe/motion.ts`: pure motion model (intro timeline, snow, storm, smoke, flicker, twinkle)
- `src/components/cards/premium3d/stage/cards/globe/particles.ts`: snow and smoke point renderers
- `src/components/cards/premium3d/stage/cards/globe/bloom.ts`: desktop-only adaptive selective bloom
- `src/components/cards/premium3d/stage/cards/globe/sound.ts`: synthesised storm shimmer
- `docs/snow-globe-stage-c.md`, `docs/screenshots/snow-globe/stage-c/*`

**Modified**
- `globe/GlobeWorld.tsx`: animation loop, tap and shake, lights driven by the timeline
- `globe/build.ts`:
  - emitter levels
  - brightness cap for non-emitters
  - the chimney marker is now found (it was missed by the mesh-only check)
  - softer snow band
- `cards/globe.tsx`: passes the engine's clock and mode
- `globe/GlobeLab.tsx`: clock and review options
- `scripts/globe/render-gallery.mjs`: Stage C frames
- `premium3d/rig.ts`: three **optional** fields on the shared state type (`stormAt`, `sound`, `motion`), with no runtime change for other cards
- `stage/Stage.tsx`: `STAGE_INTERACTIVE` (snow globe only), hint line and sound toggle
- `app/globals.css`: `.stg-hint`
- `tests/globe.test.ts`

**Untouched:** the homepage hero, the other five cards' scenes and models, registry, wallet, credits, pricing and the database.

## 6. Decisions for you at this gate

1. **Idle pause.** The card engine stops rendering 25 s after the last interaction to save battery (all six cards behave this way). Falling snow therefore pauses if the recipient leaves the card untouched for 25 s, and resumes on any touch or mouse move. Options: keep this (recommended, battery-friendly), or keep the snow falling for as long as the snow globe card is on screen (snow globe only).
2. **Snow and objects.** Flakes fall straight through the cottage roof and tree branches rather than landing on them. At this scale it's hard to notice. Collision against the roof and tree would add CPU cost; I'd leave it.
3. **Bloom strength.** It's currently gentle, as the brief asks. Compare `c06` with `c10`. I can raise it if you want the poster's stronger glow.

## 7. Next: Stage D

- Pass the recipient and sender names into the rear engraving. The surface and text rendering already exist; the card just doesn't pass the names yet.
- The golden message reveal.
- No database or schema change (decision D4).
