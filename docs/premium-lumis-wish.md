# Lumi's Wish: the first premium card (Phase 2B.3)

Local only: not deployed. No scheduling, no payments. The six launch cards, the homepage hero and the homepage Lumi section are unchanged.

## What it is
A 2D, CSS-driven greeting that plays on the existing public card URL: a glowing star appears, Lumi (the approved golden star) wakes, notices the recipient, golden motes gather, the name is revealed, the message appears, Lumi celebrates, and a final wish (ripple, shooting wish-star, floating words) completes it. Occasion-neutral, midnight plum with rose, lavender and gold light. Tap or press Enter/Space on Lumi for more sparkles.

## Architecture
| Piece | Where |
|---|---|
| Premium registry, server-side tier | `src/modules/templates/registry.ts` (`PREMIUM_TEMPLATE_KEYS`, `premiumTemplates`, `templateTier`) kept separate from the six standard keys |
| Scene | `src/components/cards/scenes/LumisWishScene.tsx`, registered in its own `premiumScenes` map (lazy chunk per scene, like the others) |
| Character frames | `public/art/lumi/lumi-awake.webp`, `lumi-asleep.webp` (22 KB + 21 KB), rendered from the same procedural model as the homepage Lumi via `scripts/lumi-e2e.mjs still` (`STILL_QS="still=1&awake=0"` for the sleeping pose; the dev-only lab accepts `?awake=0`) |
| Motion | `.lw-*` CSS in `globals.css` + the existing `ParticleBurst` 2D canvas (idle = no frames) and `useSchedule` |
| Creation flow | `CreateWizard.tsx`: premium card with a Premium badge and the credit cost, free preview, sign-in handoff, wallet hints, confirmation, remaining premium balance |
| Publishing | `POST /api/cards` (session required) -> `publishOwnedCard` (wallet engine) |

No WebGL, no Three.js, no new dependency: the recipient page never loads the homepage Lumi canvas.

## Rules
- Previewing is free and never calls the API or creates a card.
- Publishing needs a signed-in account (anonymous -> 401 `SIGN_IN_REQUIRED`) and consumes 1 total + 1 premium credit through the existing ledger, atomically; no premium credit -> 402 `INSUFFICIENT_PREMIUM_CREDITS` and nothing is deducted; Idempotency-Key replays create one card.
- The tier is resolved on the server from the template key; a client `tier` is ignored in both directions.
- A Free user's welcome credit pays for the first Lumi's Wish. The card is never described as free.
- Recipients see only the greeting: no wallet, credit, tier, owner or account details.
- Reduced motion: every animated layer is off and transient layers are hidden, so the finished card (name, message, Lumi awake) shows at once. Keyboard: Lumi is a labelled button with a visible focus ring.

## Notes and limits
- Lumi is two stills cross-faded plus CSS motion (squash, float, tilt), not a live 3D rig: eye blinks and head turns are not individually animated.
- The premium card is not in the homepage gallery on purpose (gallery = the six free cards).
- The sign-in handoff keeps the unfinished card in this tab's `sessionStorage` for one round trip (removed on read); disclosed on the privacy page, whose wording still needs legal review.

## Tests
`tests/premium.test.tsx` (registry, scene SSR, reduced-motion CSS contract), `tests/wallet-routes.test.ts` (premium publishing, rollback, races, tier forgery), `scripts/wallet-e2e.mjs` (real sessions, 25 simultaneous premium requests), `scripts/premium-shots.mjs` (UI journey, screenshots, reduced motion, keyboard, widths).
