# Lumi: homepage "Meet Lumi" section and /lab/lumi

## Where things live
- Homepage section: `src/components/landing/MeetLumi.tsx` (guided flow, static preview, fallbacks). Wired in `src/app/(site)/page.tsx` after the card gallery.
- 3D (lazy, never in the initial bundle): `src/components/lumi/LumiStage.tsx` -> `LumiCanvas.tsx` (react-three-fiber, procedural character), `useRunning.ts` (pause off-screen / hidden tab), `lumiMath.ts` (timeline, WebGL probe), `greeting.ts` (name cleaning and sample greeting).
- Static preview render: `public/art/lumi/lumi-preview.webp` (a transparent render of the same procedural model, via `node scripts/lumi-e2e.mjs still <out.png>` on the dev server).
- `/lab/lumi` (`src/app/(lab)/`): development only. 404 in production unless `ENABLE_LAB=1` at build, noindex, disallowed in robots, not in the sitemap.

## Behaviour
Sleeping preview (no Three.js) -> "Meet Lumi" button -> 3D chunk downloads -> Lumi wakes -> "Who would you like to make smile?" (optional name) ->
celebration -> sample greeting + "Create Your Card" (/create) and "Try Another Name". The name is local state: no request, storage, URL parameter or card.

Fallbacks keep the full flow usable with a still Lumi: no WebGL (the 3D chunk is never downloaded), chunk load failure, WebGL context loss, and a device that cannot hold ~14 fps.
Reduced motion: no float, spin, bounce, particles or pointer following; short smile and glow only, frames rendered on demand.

## Rendering policy
`frameloop="demand"` with one driver: 60 fps while reacting, ~30 fps idle, paused when off-screen or the tab is hidden. Pixel density is capped (1.75, 1.4 on 4-core or fewer) and reduced adaptively. Textures and geometry are disposed on unmount.

## Browser checks (dev tooling, not part of `npm test`)
`scripts/lumi-e2e.mjs` drives Chrome over CDP: `flow` (full interaction, screenshots), `perf` (production server: bundle, activation, main-thread, pause, memory), `cleanup` (lab: context release, rAF and listener counts), `still`.
Screenshots: `docs/screenshots/meet-lumi/` (homepage section) and `docs/screenshots/lumi/` (lab prototype).
