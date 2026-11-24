# Christmas Snow Globe: Stage B1 asset preparation

Status: **2026-11-24, research only.** Nothing has been downloaded or installed, and no code has changed. Every item below is waiting for approval.
Reference: `public/art/hero/videos/christmas-poster.webp` and `christmas.mp4` (decision D1).

## 1. Mawica assets already in the repo (reused)

| Asset | Path | Use |
|---|---|---|
| Hero poster and video | `public/art/hero/videos/christmas-poster.webp`, `christmas.mp4` | Visual benchmark and side-by-side comparison (read only) |
| Wordmark (letters only) | `public/brand/mawica-mark.png` (2000×560, alpha) | Gold logo on the front of the base, used as an alpha mask; never redrawn |
| Site fonts | `--font-fraunces`, `--font-jakarta` | Rear engraving texture |
| Tree generator | `stage/cards/tree-model.ts` | Starting point for the central tree and pines (to be upgraded) |
| Materials and helpers | `stage/gfx.ts` (`gold`, `glass`, `starGeometry`, `rng`) | Starting points |
| Wish layout | `ar/wish.ts` | Clamping engraving text (RTL and emoji safe) |

The repo has no 3D models, HDRIs or PBR texture sets.

## 2. Tooling: Blender (development only)

| | |
|---|---|
| Package | `brew install --cask blender` (Blender 5.3.0, GPL-3.0, free) |
| Disk | About 1.2 GB. **This Mac has 23 GB free (95% used).** |
| Use | Headless scripts only (`blender -b -P scripts/globe/*.py`): decimate downloaded models, add roof snow, chimney and window glow to the cottage, pose and retexture the reindeer, bake AO, pack 1K texture atlases, export GLB. Scripts are committed so every asset is reproducible. |
| Runtime | None. The site never depends on Blender, and the GPL does not apply to files Blender produces. |
| Also already on this Mac | `usdchecker`, `usdcat`, `usdrecord` (Apple USD tools, for USDZ checks in Stage E) |

## 3. Candidate models

Triangle counts and licences come from the Sketchfab and Poly Haven public APIs, checked 2026-11-24.

### 3.1 Cottage

| # | Model | Licence | Tris | Materials | Fit with the reference | Verdict |
|---|---|---|---|---|---|---|
| **C1** | [Scandinavian Log Cabin](https://sketchfab.com/3d-models/scandinavian-log-cabin-e89718f746484189902162a91ae0b504) by rivetech | CC BY 4.0 | 29,253 | 8 PBR (2K base colour, normal, roughness, metallic) | Log walls, gable roof, porch with steps: closest to the poster's cottage | **Recommended.** In Blender: decimate to about 12k, add the snow roof, brick chimney, warm window glass and door wreath, and repack to one 1K atlas |
| C2 | [Winter House](https://sketchfab.com/3d-models/winter-house-05e24d513635445380813a3ce15206db) by shahriyarshahrabi | CC BY 4.0 | 144,043 | 1 photogrammetry texture | Photoreal and snowy, but a white plaster farmhouse, not timber; lighting baked into the texture | Fallback |
| C3 | [Wooden Log Cabin](https://sketchfab.com/3d-models/wooden-log-cabin-21bf3df011b147598cdb43fea839cef7) by donnichols | CC BY 4.0 | 8,776 | PBR | Plain plank shed, no porch | Not recommended |

### 3.2 Reindeer

**No free model is both realistic and actually a reindeer.** The free realistic options are deer or elk; the reindeer-named free models are cartoons.

| # | Model | Licence | Tris | Notes | Verdict |
|---|---|---|---|---|---|
| **R1** | [Realistic Animated Elk](https://sketchfab.com/3d-models/realistic-animated-elk-3d-model-787834f9caa2474d9f1814b807c072d7) by WildMesh 3D | CC BY 4.0 (author: "use it in personal or commercial projects") | 7,886 | Realistic anatomy and textures, rigged with 53 animations (author notes rig issues, which don't matter for a static pose). In Blender: standing pose, reindeer colouring (pale neck mane, grey-brown coat), antlers adjusted toward reindeer shape | **Recommended free option.** It stands about 3.5 cm tall inside the globe, where these changes read well |
| R2 | [Reindeer 3D](https://sketchfab.com/3d-models/reindeer-3d-c98bb7b411274b4887bb6d12b4a657f2) by soufianeoujihi | CC BY 4.0 | 16,464 | Realistic stag (red-deer look), specular workflow | Alternative |
| R3 | [Realistic Reindeer 02](https://www.cgtrader.com/3d-models/animal/mammal/realistic-reindeer-02) (about $35) or [Detailed Reindeer Model Pack](https://www.cgtrader.com/3d-models/animal/mammal/detailed-reindeer-model-pack) (about $10), CGTrader | Royalty Free (paid) | Unknown | True reindeer. **Paid; needs your approval**, and the licence must be checked for redistribution inside downloadable GLB/USDZ files | Only if R1 fails at the visual gate |
| ✗ | [Realistic Deer (Demo)](https://sketchfab.com/3d-models/deer-realistic-3d-model-demo-free-3997d669818c4e0d8c8bcafb0a1ae2ee), [Reindeer #3December](https://sketchfab.com/3d-models/reindeer-3december-9ddb2e9d5f72445db777fefe08059685) | NonCommercial / NoDerivs | — | — | Excluded (licence) |

### 3.3 Lantern and trees (Poly Haven, CC0, no attribution required)

| # | Asset | Licence | Tris | Verdict |
|---|---|---|---|---|
| **L1** | [street_lamp_01](https://polyhaven.com/a/street_lamp_01) by Josh Dean | CC0 | 30,610 | **Recommended.** A black Victorian lamp post, exactly the poster's style. Decimate to about 3k (it is about 5 cm tall in the globe) |
| ✗ | [fir_tree_01](https://polyhaven.com/a/fir_tree_01), [pine_tree_01](https://polyhaven.com/a/pine_tree_01) | CC0 | 7.8M and 17.4M | Excluded: scanned foliage far too heavy for the web, and it decimates badly |

**Trees, snowman, presents, glass, base and terrain:** built in code (procedural), as approved in the Stage A plan, with these upgrades:
- the tree uses needle cards (generated alpha texture) instead of the flat blades it has today
- the snowman gets a knitted scarf normal map and a lathe-turned hat
- the base gets a gold snowflake and filigree band texture with the wordmark mask
- the snow is a heightfield with a path and footprints

## 4. Environment lighting and PBR textures (Poly Haven, CC0)

| Asset | Use | Resolution | Download size |
|---|---|---|---|
| **[christmas_photo_studio_04](https://polyhaven.com/a/christmas_photo_studio_04)** HDRI | Glass and gold reflections: warm interior with a Christmas tree and fairy lights, matching the poster's mood | 1k `.hdr` (ships after conversion to about 512 px, ≤ 600 KB) | 1.54 MB |
| [blaubeuren_church_square](https://polyhaven.com/a/blaubeuren_church_square) HDRI | Alternative: snowy night town | 1k | about 1.5 MB |
| [snow_02](https://polyhaven.com/a/snow_02) | Ground and roof snow (normal, roughness, AO) | 1k JPG | about 1.5 MB set |
| [red_brick_03](https://polyhaven.com/a/red_brick_03) | Chimney | 1k JPG (cropped to 256 for shipping) | about 2 MB set |
| [rough_wood](https://polyhaven.com/a/rough_wood) | Only if C1's own wood textures fail after atlas repacking | 1k | about 2 MB set |

Download size is about 5 MB of source files, which stay in a git-ignored `assets-src/` folder. Only the optimised outputs are shipped under `public/`.

## 5. Shipping budget for the web model (desktop / mobile)

| Item | Triangles | Textures shipped |
|---|---|---|
| Cottage (C1, processed) | 12k / 6k | 1× 1024² atlas (base colour, ORM, normal) |
| Reindeer (R1, processed) | 7.9k / 4k | 1× 512² set |
| Lantern (L1, processed) | 3k / 1.5k | Material colours only |
| Procedural (tree, pines, snowman, presents, terrain, glass, base) | about 180k / 70k | Canvas-generated at runtime (no files) plus snow 512² |
| HDRI | — | about 512 px RGBE |
| **Total** | **≤ 250k / ≤ 90k** | **About 1.5 MB of GLB and textures over the network**, loaded only by this card's lazy chunk |

## 6. Attribution (required for the CC BY models C1 and R1)

CC BY 4.0 allows commercial use, modification, and redistribution inside our GLB and USDZ files, provided we give credit: author, title, link, licence, and a note that the model was changed. Proposal:
- `public/models/snow-globe/CREDITS.md` and `docs/asset-credits.md` (no UI change), **and**
- one credits line somewhere users can reach it. Your choice: a small "Model credits" link on the snow globe card's ending, or a line on the existing Terms page.

Poly Haven CC0 assets need no attribution; we will credit them anyway in `CREDITS.md`.

## 7. Approvals needed

1. Install Blender 5.3.0 with Homebrew (about 1.2 GB, development only).
2. Download the Poly Haven CC0 files: christmas_photo_studio_04 HDRI, street_lamp_01, snow_02, red_brick_03 (and rough_wood if needed).
3. Use the CC BY models **C1 Scandinavian Log Cabin** and **R1 Realistic Elk** (restyled as a reindeer). Sketchfab downloads need a signed-in Sketchfab account: either you download the glTF zips into `assets-src/`, or you sign in to Sketchfab in the in-app browser and I download them there.
4. Where the credits line goes (section 6).
5. No paid assets for now. R3 only if the free reindeer fails at the visual gate, and then only after a separate approval.
