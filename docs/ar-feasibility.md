# Phase AR-1: "View in AR" for A Special Gift — feasibility audit and proposed architecture

Status: **audit only, nothing implemented.** Baseline `b47222b` (Phase 2E.3). Written 2026-11-17.

## 1. Verdict

Feasible, with one important shape to the answer: **Android and iPhone need two different AR paths**, and the iPhone path is much more limited.

| | Android (Chrome + ARCore) | iPhone (Safari, AR Quick Look) |
|---|---|---|
| Technology | WebXR `immersive-ar` + hit-test, rendered by our own three.js | USDZ file handed to Apple's Quick Look viewer |
| Who renders | Us (full control) | Apple (we hand over a file and lose control) |
| Reuse of 2E.3 scene | High: same geometry, materials, timeline code | Geometry and baked textures only |
| Gift-opening animation | Yes, same timeline | Yes, but transforms only (move/rotate/scale) |
| Light glow, gold dust, fades | Yes (with care) | **No** (no custom lights, particles, additive blending or opacity animation) |
| Personalised wish | Live text, plus an HTML overlay for the full message | Text baked into a texture inside the file; no HTML |
| Mawica ending | In-scene and overlay | Only after the user closes Quick Look (back on the card page) |
| Reduced motion | Honoured | Quick Look ignores it: we must hand over a static file instead |

The iPhone version will look clearly simpler than the 2E.3 card. That should be accepted up front rather than discovered later.

## 2. Audit of the current implementation

- **Scene:** `src/components/cards/premium3d/stage/cards/gift.tsx` (149 lines). Box 2.0 units wide, open body (four walls + floor), lid with ribbon bands, bow built from swept ribbon strips, gold trim, inner glow plane, point light, additive glow sprite and light shaft, contact shadow textures, `Particles` gold dust. ~8.6k triangles desktop, ~6k mobile.
- **Animation** is a pure function of time `t` in `useFrame` (ribbon slackens 3.0–4.9 s, lid stirs/lifts/tips 4.7–7.4 s, glow 5.0–7.6 s). Because it is deterministic, it can be **sampled into keyframe clips**, which is exactly what glTF and USDZ need.
- **Geometry builders** (`ribbonStrip`, `bowLoop`, `bowTail`, `RoundedBoxGeometry`) are plain functions of numbers and can run outside React. The only browser dependencies are canvas textures (`innerTexture`, `glowTexture`, `shadowTexture`, `poolTexture`).
- **Materials:** `MeshPhysicalMaterial` with sheen and clearcoat (`satin`, ribbon), metallic gold. glTF export covers these (`KHR_materials_sheen`, `KHR_materials_clearcoat`). USDZ (UsdPreviewSurface) has clearcoat but **no sheen**, so the satin look will be flatter on iPhone.
- **Shell:** `Stage.tsx` already lazy-loads three.js only for card pages (`dynamic(() => import("./StageCanvas"))`). The personal message is DOM text, not 3D.
- **Exporters available** in the installed three 0.187: `GLTFExporter` (animations, PBR extensions) and `USDZExporter` (animation tracks for **position, quaternion and scale only**). No extra dependency needed.
- **Card access:** `/c/[slug]` calls `getPublishedCard`, which only returns `status: "PUBLISHED"`. `SCHEDULED` and `CANCELLED` cards are never public. Photos go through `/api/media/[id]` with per-request authorisation.
- **Headers:** `Permissions-Policy` sets `camera=(), microphone=(), geolocation=(), payment=()`. It does not mention `xr-spatial-tracking`, so WebXR defaults to same-origin allowed. Chrome's WebXR AR does not ask for the camera through `getUserMedia`, so `camera=()` should not block it. **Both need confirming on a real Android phone**; I would add `xr-spatial-tracking=(self)` explicitly.

## 3. Proposed architecture

### 3.1 Shared gift model (one source, two outputs)

Extract the pure parts of `gift.tsx` into `stage/cards/gift-model.ts`: geometry builders, material factories, and a `poseAt(t)` function returning the transforms/opacities the frame loop sets today. `gift.tsx` then calls these. The 2E.3 card must render pixel-identically afterwards (checked by the existing thumbnail renders and the stage tests).

From that module:
- **Generic GLB** (no personal data): built offline by a script, committed to `public/ar/special-gift.glb`, with the opening animation sampled into one clip. Public and cacheable is fine because it contains nothing private.
- **Generic USDZ**: same, `public/ar/special-gift.usdz`, transform animation only, glow replaced by a baked emissive inner plane that rises/scales.

### 3.2 Personalisation without private files

The recipient's card page **already has** the first name, greeting and message (they are in the HTML of a published card). So the personalised parts are built **in the recipient's browser**, never stored:

- **Android:** the live WebXR scene draws a wish panel (canvas texture: "For Anna", greeting, short message). A DOM overlay (`dom-overlay` feature) shows the full message, scrollable, plus Close.
- **iPhone:** the browser loads the generic model, adds the wish panel as a textured plane with its rise/scale animation, runs `USDZExporter` locally, and opens the result from a `blob:` URL via `<a rel="ar">`. This is the technique Google's `<model-viewer>` uses. The blob lives only in that page's memory.

Result: **no personalised model file ever exists on a server, a CDN or a public URL.** Short-lived signed URLs are only needed if we later add a server-rendered fallback (for example Android Scene Viewer, which requires a reachable HTTPS file). I do not recommend that for the MVP.

Unpublished/scheduled cards: the AR button only exists on `/c/[slug]`, which already 404s unless `PUBLISHED`. The create-flow preview would not get the button in the MVP. The optional private photo is **excluded** from AR in the MVP.

### 3.3 Loading and bundles

- The "View in AR" button is plain DOM in `CardPlayer` beside Replay, shown only for `special-gift`. It contains no three.js code.
- On tap: feature detection (`navigator.xr.isSessionSupported("immersive-ar")`, or `document.createElement("a").relList.supports("ar")` for iOS), then `import()` of a separate `ar/` chunk. Homepage, catalogue and `/create` bundles stay unchanged; I would add a bundle-size check to the test run.
- The existing 3D card is not touched apart from the behaviour-preserving extraction in 3.1.

### 3.4 Fallback (desktop, iPad without AR, Firefox, in-app browsers)

- Desktop: "View in AR on your phone" with the card's existing QR code (`/c/[slug]/qr.png`).
- Phone without AR: the button hides itself after detection fails; the normal 3D card is unaffected.
- **In-app browsers (WhatsApp, Instagram, Messenger):** this is the biggest practical risk because Mawica cards are shared by WhatsApp. iOS in-app browsers usually do not support `rel="ar"`, and Android in-app/custom tabs vary for WebXR. The fallback should say "Open in Safari / Chrome to view in AR" with a copy-link action.

## 4. Visual design per platform

| Element | Android WebXR | iPhone Quick Look |
|---|---|---|
| Gift on the floor, real-world scale | ~30 cm box (scale 0.15), origin at the box's base centre, placed by hit-test reticle | Same file scale; Quick Look handles placement and its own shadow |
| Ribbon loosening | Same timeline (scale/slip + fade) | Slip and shrink only (no fade) |
| Lid lift and tip | Same | Same (transforms) |
| Golden light | Emissive inner plane + additive glow (tested on camera feed) | Emissive plane rising/scaling; no real light, no bloom |
| Floating particles | Instanced gold sparkles (≈60) | A dozen small gold meshes moved by keyframes, or none |
| Wish reveal | Panel rises out of the box, name then message; full text in overlay | Panel rises out of the box; message capped (see 5) |
| Mawica branding | Wordmark on the panel's last beat + overlay end card | Small wordmark on the panel; full end card on the page after closing |
| Lighting | Our lights + estimated light (`light-estimation`) where available | Apple's own lighting; our lights are ignored |

## 5. Platform limitations to document and test

- **Text:** rendered to a canvas texture in the browser, so Unicode, accents and emoji use the phone's fonts. On iPhone the text is frozen into the file at export, so long messages need a cap (proposal: name + greeting + first ~160 characters, ending "…read the full message on the card"). RTL scripts need a test.
- **Particles:** no point sprites or additive blending in USDZ; Android additive glow over a camera feed can wash out on bright floors.
- **Animation:** Quick Look plays and loops the timeline automatically; there is no "play once then stop" control, so the clip should end on a calm held pose.
- **No HTML** inside Quick Look, and no sound in the MVP.
- **Reduced motion:** Android skips to the opened pose. iPhone gets a separately exported static USDZ (end frame, no tracks).
- **Size and memory budgets:** GLB ≤ 1.5 MB, USDZ ≤ 3 MB, textures ≤ 1024 px, ≤ 15k triangles, client-side USDZ export ≤ 1.5 s on a mid-range iPhone.

## 6. Implementation phases (after this audit is approved)

1. **AR-1a — Shared model.** Extract `gift-model.ts`, keep the 2E.3 card identical, write the export script producing the generic GLB and USDZ. Check on macOS (Quick Look previews USDZ animation) and in a glTF validator.
2. **AR-1b — Android WebXR.** Lazy `ar/` chunk, hit-test placement, timeline, wish panel, DOM overlay, reduced motion, exit back to the card.
3. **AR-1c — iPhone Quick Look.** Client-side personalised USDZ export, `rel="ar"` launch, static reduced-motion variant, message cap.
4. **AR-1d — Button, detection and fallbacks.** Button in `CardPlayer`, QR hand-off on desktop, in-app browser guidance, bundle-size guard, unit tests (text cap, special characters, detection logic).
5. **AR-1e — Device validation.** Real Android (ARCore) and iPhone: scale, orientation, placement, animation, long and special-character messages, reduced motion, memory and export time. **This needs your phones; I cannot do AR in the Browser pane or headless Chrome.**

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Links opened inside WhatsApp/Instagram can't launch AR | Many recipients never see AR | Detect in-app browsers and offer "open in Safari/Chrome" |
| iPhone result looks much simpler than the card | Disappointment with the premium feature | Agree the reduced iPhone scope before building; design for it |
| Client-side USDZ export slow or memory-heavy on older iPhones | Delay or crash before AR opens | Keep the generic model light; measure in AR-1e; fall back to the generic, unpersonalised USDZ |
| Quick Look behaviour with `blob:` URLs changes between iOS versions | AR stops opening | Feature-test on current iOS; keep the generic public USDZ as fallback |
| Satin/sheen not supported in USDZ | Flatter ribbons on iPhone | Bake sheen into the base colour texture for the USDZ export |
| Extraction refactor alters the 2E.3 card | Regression in an accepted card | Pixel comparison against the current thumbnails before and after |
| Permissions-Policy blocks WebXR | Android AR fails | Add `xr-spatial-tracking=(self)`; verify on device |
| ARCore missing on the phone | No AR on that Android | Button hidden after detection; normal card unaffected |

## 8. Recommended MVP scope

- A Special Gift only; published cards only; no photo; no sound.
- **Android:** WebXR placement, the full opening timeline, gold sparkles, wish panel with name and greeting, full message in the overlay, Mawica end card.
- **iPhone:** client-side personalised USDZ with transform animation, a wish panel (name, greeting, capped message, small wordmark), and a static variant for reduced motion.
- **Everywhere else:** QR hand-off on desktop and "open in your browser" guidance in in-app browsers.
- **Out of MVP:** Scene Viewer, server-generated or signed personalised files, other cards, photo in AR, audio, light estimation tuning.

No existing system (wallet, scheduling, delivery, CI, Azure/AWS) is touched by this plan.

---

## AR-1a results (2026-11-17)

**Done:** the gift exists once, in `stage/cards/gift-model.ts`, and both the 3D card and the AR model build from it. Generic (non-personal) AR files are exported to `public/ar/`.

### Shared model
- `gift-model.ts`: geometry builders, materials (`giftResources`), scene graph (`buildGift`, with named nodes) and the opening timeline as a pure function (`giftPose(t)`).
- `gift.tsx` keeps only the card-specific parts: camera, lights, ground pool, contact shadows, gold dust and applying the pose each frame.
- **The 3D card is unchanged.** Before/after renders at 5 moments × desktop/mobile differ only by the drifting gold dust: mean difference 0.0001–0.0084 per channel, the same range as two renders of the unchanged card (0–0.0095).

### AR model (`premium3d/ar/gift-ar.ts`)
- 0.33 × 0.43 × 0.33 m closed (box 0.30 m wide plus lid overhang and bow), origin at the centre of the base, resting exactly on the floor (min Y = 0.000 m), Y up, metres.
- One clip, `open`, 7.4 s at 30 fps: the card's timeline from 2.6 s (just before the ribbon loosens) to the lid at rest, then a 2.4 s hold with the lid's gentle hover. 57 transform tracks (ribbon, lid, bow, 16 sparkles).
- Ribbon bands slip down and shrink into the box (opacity can't be animated). Inside glow is a constant emissive plane revealed by the lid. 16 gold sparkles rise and spiral out, then shrink away. No point light, glow sprite, light shaft, ground or shadow planes.
- Bow ribbons: the card draws them double-sided; the USDZ exporter writes no double-sided flag, so the inner faces rendered black in Apple's renderer. Fixed by adding real back faces (offset 1 mm).
- A `wish_anchor` node marks where the personal wish will rise to in AR-1b/1c.

### Files
| File | Size | Contents |
|---|---|---|
| `special-gift.glb` | 831 KB | animated, 8.0k triangles, sheen + clearcoat + emissive-strength extensions |
| `special-gift-still.glb` | 591 KB | opened pose, no animation (reduced motion) |
| `special-gift.usdz` | 2.6 MB | animated, horizontal-plane anchoring, Quick Look compatible mode |
| `special-gift-still.usdz` | 1.9 MB | opened pose, no animation (reduced motion) |

All within the budget (GLB ≤ 1.5 MB, USDZ ≤ 3 MB). The USDZ is larger because USD stores geometry and keyframes as text.

### Validation
- **glTF:** Khronos glTF Validator: 0 errors, 0 warnings on both GLBs.
- **USDZ:** Apple `usdchecker --arkit`: passes on both files.
- **Animation:** played in the browser by reloading the exported GLB into three.js (`/lab/ar`). The USDZ was rendered at 0 s, 4.6 s and 6.7 s, plus the still, by Apple's `usdrecord`: closed → ribbon gone, lid tipping with sparkles → open (`docs/screenshots/ar/usdz-apple-renderer-frames.webp`). `usdrecord` has no environment lighting, so the gold looks brown there; Quick Look lights with its own environment.
- Bundles unchanged: `/` 613.2 / 191.9 KB gzip, `/create` 722.0 / 222.4, `/sign-in` 595.2 / 185.5. AR code is imported only by the lab page; a test enforces this.
- `/lab/ar` returns 404 in a production build.
- Tests 432/432 (7 new in `tests/ar-gift.test.ts`), TypeScript and ESLint clean.

### Not verified yet
- **No real iPhone or Android device.** Quick Look placement, scale feel, lighting, looping and the satin look on device are unchecked; that is AR-1e.
- Quick Look loops the clip, so after the hold the lid snaps back closed. Whether to accept this or export a separate gentle "close" at the end is a device-review decision.
- Sheen is dropped in USDZ (no UsdPreviewSurface equivalent); the ribbon will look plainer on iPhone.

### How to regenerate
Run the dev server, then `node scripts/ar-export.mjs` (writes `public/ar/`). Preview at `/lab/ar` (`?t=4.6` freezes a moment).

---

## AR-1b results (2026-11-17): Android WebXR

**Done, but not yet run on a phone.** The full Android flow is built and its parts are checked on the desktop. A real WebXR AR session needs an ARCore Android phone, which I don't have here.

### Recipient flow
1. On a published **A Special Gift** card, a **View in AR** button appears beside Replay, but only if `navigator.xr.isSessionSupported("immersive-ar")` is true. Everywhere else (iPhone, desktop, Firefox, unsupported Android) nothing renders, so the card is exactly as before.
2. Tapping it downloads the AR code (2 chunks) and asks for the AR session at once, while the tap still counts as user activation. The scene is built only after the session starts.
3. "Move your phone slowly to find the floor" → a gold ring follows the floor (hit-test) → "Tap the floor to place your gift".
4. The gift appears facing the viewer with a soft contact shadow. It plays the same opening as the AR files, with a real golden light inside the box.
5. Once the lid has tipped back (~4.9 s after placing), the wish card rises out of the box and turns to face the viewer. It shows "For name", the greeting, the message (capped at 220 characters / 7 lines), "With love, sender" and the Mawica wordmark.
6. A bottom sheet then shows the full message (scrollable), the ending ("mawica. Send your feelings to others.") and **Create your own card**. **Close** is always available and ends the session, returning to the card.

### Privacy
- The wish is drawn on the phone from the text already on the published card page. Nothing is uploaded, no file is created, and the drawing exists only in that tab's memory. A test asserts the button makes no network calls.
- The button is only on `/c/[slug]`, which already returns 404 unless the card is `PUBLISHED`. The create-flow preview, scheduled and cancelled cards never get it. The private photo is not used.

### Text
`ar/wish.ts`, unit-tested:
- Text is cut by grapheme, so it never splits an emoji, family emoji, flag or accented letter. It prefers a word boundary when cutting.
- Text wraps to the panel width, keeps the sender's line breaks, and breaks words longer than a line.
- Names are capped to one line with an ellipsis.
- Hebrew and Arabic messages are drawn right-to-left; the labels and wordmark stay left-to-right.
- Markup-like text such as `<b>` and `&` is drawn as plain characters on a canvas, never parsed.
- The phone's own fonts draw the text, so emoji come from the system font.

### Reduced motion
The gift appears already open with the wish card in place, and the sheet shows at once with no slide-in.

### Errors
- **Permission refused:** "AR needs your permission to use the camera. Tap View in AR to try again."
- **Any other failure:** "AR couldn't start on this phone."
- **No surface tracking:** the session ends with a message.

### Checks run (desktop, headless Chrome)
- **Real Chrome:** the button does not appear, because desktop Chrome has no `immersive-ar`.
- **Simulated AR-capable browser** (fake `navigator.xr` that refuses the session):
  - the button appears beside Replay;
  - tapping loads 2 new chunks and calls `requestSession` once;
  - the permission message shows, and Close hides the overlay.
  
  Screenshot: `docs/screenshots/ar/ar-button-and-permission-error.webp`.
- **Scene without WebXR** at `/lab/ar?live=1` (`&t=`, `&name=`, `&msg=`, `&from=`, `&reduced=1`): checked the default wish, a 40-character name with a long emoji message (clipped, full text in the sheet), and a Hebrew message. Screenshot: `docs/screenshots/ar/android-scene-lab-preview.webp`.
- **Bundles:**
  - `/`, `/create` and `/sign-in` are unchanged (191.9 / 222.4 / 185.5 KB gzip).
  - The card page grows by 1.1 KB gzip (179.0 → 180.1), which is the button and overlay. The AR scene, three.js scene code and WebXR loader download only on tap.
- **Tests:** 441/441 (9 new across `tests/ar-wish.test.ts` and `tests/ar-gift.test.ts`). TypeScript and ESLint clean.

### Not verified (needs an ARCore Android phone)
- That the session starts with the site's current `Permissions-Policy`. `camera=()` is set and `xr-spatial-tracking` is not listed. I have not changed the header yet; if AR fails to start on a device, adding `xr-spatial-tracking=(self)` is the first fix.
- Hit-test placement, real-world scale, facing direction, lighting on real floors, frame rate, heat and memory.
- That taps on the overlay controls don't also place the gift (`beforexrselect` is handled in code but untested on a device).
- Whether the scene reads well outdoors and in bright rooms (no light estimation in the MVP).

### How to test on your Android phone
1. Use Chrome on an ARCore-supported phone, on the same Wi-Fi as the Mac.
2. WebXR needs HTTPS, or `localhost` through USB port forwarding:
   - connect by USB;
   - open `chrome://inspect` on the Mac → Port forwarding → `3010` → `localhost:3010`;
   - on the phone, open `http://localhost:3010/c/<slug of a published special-gift card>`.
3. Tap **View in AR**.
