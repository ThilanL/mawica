# Security notes

## Client identification and rate limits (trust boundary)

Rate limits are keyed by `HMAC(RATE_LIMIT_SALT, scope|clientIp)`; raw IPs are never stored.

`X-Forwarded-For` is **client-controlled** unless a proxy we control rewrites it. Each proxy *appends*
the address it saw on the right, so only the rightmost `TRUSTED_PROXY_HOPS` entries were added by us.
`pickClientIp` (src/modules/security/client-hash.ts) therefore takes the entry `hops` places from the
**right** and ignores everything to its left. Spoofing the left side cannot change the bucket (tested).

| `TRUSTED_PROXY_HOPS` | Behaviour |
|---|---|
| `0` (default) | Forwarded headers ignored. All requests share one bucket. Fails closed (cannot be bypassed) but throttles every visitor together. Never launch like this. |
| `1` | One trusted proxy (Azure App Service front end). |
| `2` | Azure Front Door (or Application Gateway) in front of App Service. |

Missing/short/malformed header with `hops > 0` also falls into the shared bucket (fail closed).

### Azure App Service requirements (deployment blocker until verified on staging)
1. The App Service front end appends the connecting address (with port) to `X-Forwarded-For`. Confirm on a staging slot by sending `X-Forwarded-For: 1.2.3.4` yourself and logging what the app receives: the real client IP must be the rightmost entry.
2. Set `TRUSTED_PROXY_HOPS` to the real hop count (1, or 2 behind Front Door). A wrong number either lets spoofed values in (too low) or collapses everyone into one bucket (too high).
3. If using Front Door, restrict App Service access to it (access restriction by service tag `AzureFrontDoor.Backend` plus `X-Azure-FDID` header check). Otherwise clients can bypass Front Door and hit the origin directly.
4. This **cannot be verified locally** (there is no Azure proxy here). Only the parsing logic is tested. Status: **open deployment blocker**.

## Other controls
- Server-side zod validation, control/bidi character stripping, length limits, 4 KB body cap, honeypot.
- Text is rendered only as React text nodes (no `dangerouslySetInnerHTML`).
- Slugs: 12 chars, ~1.1e18 space, `nanoid` CSPRNG, unique index with retry.
- Rate limiting is a single atomic `INSERT .. ON CONFLICT` statement (tested with 40 parallel hits).
- Retention: rate-limit rows purged 24 h after expiry; reports 90 days (`npm run admin -- purge`).
- Removal: `npm run admin -- remove <slug> "reason"`. Card page, QR and report endpoints return 404 immediately; pages are never cached (`proxy.ts` gives a real HTTP 404).
- Database isolation: see docs/local-database.md; `src/lib/db-guard.ts` is enforced by the app, Prisma config and admin CLI.
