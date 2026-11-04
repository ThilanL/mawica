# Lumi interactive 3D prototype (isolated lab)

Route: `/lab/lumi` (development only: 404 in production unless `ENABLE_LAB=1`; noindex; disallowed in robots; not in sitemap).
Code: `src/components/lab/{LumiLab,LumiCanvas,lumiMath}.tsx|ts`, route group `src/app/(lab)/`. Nothing on the public site imports it
(enforced by `tests/lumi.test.ts`). Dependencies added: `three`, `@react-three/fiber`, `@types/three`.

Lumi is a procedural prototype (extruded rounded star, sphere eyes, torus smile), not final character art.
The snow-globe is the existing flat hero image; Lumi and particles are separate live layers clipped to the glass.

States: idle float + look-around, pointer tracking (head turn + pupils), tap/click (or button) celebration
(two spins, hop, open-mouth smile, golden bursts, glow) then back to idle. Reduced motion: no float/spin/particles,
brief smile + glow only, on-demand rendering. No WebGL (or forced): static CSS star. Rendering pauses off-screen / hidden tab.

Measured numbers and limitations are in the Phase report; screenshots are in `docs/screenshots/lumi/`.
