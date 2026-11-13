# Inside914 repository guide

This repository runs the Inside914 advertising website, administrator workspace, reservation backend, and postcard exporter. It is one Next.js application, backed by Supabase, with Stripe for saving cards and future collection, and Resend for transactional email.

This guide describes the current source, not a verification of deployed production configuration. Historical documents under `docs/` record earlier phases and may describe retired products.

## Current business model

- Four geographic areas: Central, Southern, Northern, and Eastern Westchester.
- The public selector includes a clickable county map and six largest municipalities per proposed area. Population rankings use the 2020 Census, not mailing reach. See `docs/frontend-area-guide.txt` for grouping definitions and sources.
- Each new campaign uses `square_v1`: ten paid positions, F1–F6 on the front and B1–B4 on the back, at $399 per position.
- A customer selects up to four areas, chooses one position per area, and supplies artwork for each. Images can be copied between areas and then cropped independently.
- Business/contact information is required. A business category is not mandatory and does not reserve exclusive access to an area.
- Checkout saves a card using a SetupIntent. The amount due today is $0; three areas authorize a maximum of $1,197 for later collection.
- Campaigns fill independently. Collection requires an explicit administrator action and all readiness checks; a full campaign never charges automatically.
- Advertiser accounts, dashboards, recurring plans, and new double/full-side products are retired. Old account/dashboard URLs redirect to `/areas`. Historical database records and product readers remain for compatibility.
- Live collection remains disabled in source: `LIVE_COLLECTION_RELEASED = false`. The collection mode defaults to `disabled`.
- Current source enables new reservations under owner-approved policy `2026-11-02-reservations-1`, effective November 2, 2026. This approval is separate from collection and deployment; see `docs/legal/2026-11-02-reservation-approval.txt`. Existing accepted consent and intentional $1 campaign prices remain unchanged.

## How a reservation moves through the system

1. `/areas` reads open, bookable campaigns. Draft, paused, expired, or unavailable campaigns cannot be booked merely by supplying their IDs.
2. `/book/multi` gathers areas and exact positions. `category-checkout.ts` retains its historical filename but implements area/position selection, not category exclusivity.
3. `booking/cart.ts` asks database RPCs to create the group of holds atomically. If a position is taken, the operation fails rather than substituting another position. Random hold tokens are hashed before storage.
4. `/book/cart` manages each area's artwork. Signed upload URLs allow private uploads. The server checks actual file bytes, image dimensions, crop bounds, and ownership. Copied files are independent objects.
5. `/book/cart/details` saves the business and contact details. Prices and inventory are server/database controlled.
6. `/book/cart/payment` saves a card with Stripe. One Customer/SetupIntent can support the group's separate reservations. No PaymentIntent is created by this checkout flow.
7. Completion verifies the SetupIntent and consent, then confirms reservations atomically. Signed webhooks provide another completion path. Confirmation is retry-safe; webhook completion is recorded after processing.
8. An email outbox delivers confirmation and a private reservation link. `/r/[token]` exchanges the link for a scoped cookie; `/reservation` provides account-free reservation access.
9. Cancellation releases inventory and handles saved-card removal only when the card is no longer needed by other active reservations.

The single-booking routes remain because artwork editing and historical reservations still use parts of that flow. Removing every old-looking file would break these dependencies.

## Administrator workflow

Supabase Auth identifies the administrator. `lib/admin/auth.ts` additionally verifies membership in `public.admins`. Pages, actions, database policies, and RPCs enforce authorization; hiding navigation is not the security boundary.

| Area | Purpose |
| --- | --- |
| Campaigns | Create drafts, configure dates, inspect inventory, explicitly open/pause/close campaigns, and review readiness |
| Advertisers | Inspect reservation and business/contact details |
| Artwork Approval | Review customer artwork and request/record approval |
| Payments | Inspect saved cards and per-zone collection/recovery status |
| Settings | Manage persistent house artwork and operational settings |
| Production/print routes | Preview and download front/back images, track proof and mailing evidence |
| Zones | Manage geographic areas without inventing delivery routes or confirmed household counts |

Opening requires an approved layout in both application code and the private database approval registry. Other guards validate dates, pricing, inventory, and campaign conflicts. Customer artwork approval, proof freshness, payment readiness, and mailing readiness are separate checks.

## Payment architecture and safety

`lib/checkout/` handles saving a card, consent, confirmation, and cancellation. `lib/payments/` handles later collection, per-booking charge ledgers, recovery links, and payment notices.

Collection requires an allowed runtime, matching credential mode, account binding, webhook configuration, valid pricing, explicit administrator authorization, and database readiness. Live mode additionally requires the source release gate. Changing an environment variable alone cannot release live collection.

Charge creation/confirmation uses ledger identities and idempotency keys. Webhooks revalidate payment context and update the ledger. Failed payments can require a new method or 3-D Secure action through a private, expiring recovery link. Recovering one zone does not authorize charges for other zones.

The scheduled job retries emails, closes campaigns past their reservation deadline, and processes due saved-card removals. Card removal is a Stripe write in normal production operation; it was not called against Stripe during this audit. Disabling collection blocks charging, not every possible Stripe interaction: normal card-saving checkout still uses Stripe.

## Database and storage

Migrations in `supabase/migrations/` form an append-only history. Later migrations supersede older behavior. Never edit historical migrations or assume a production database is empty.

| Data | Responsibility |
| --- | --- |
| `zones`, `editions`, `slots` | Geographic areas, campaigns, physical paid positions |
| `bookings`, `booking_slots`, `reservation_carts` | Holds, reservations, inventory claims, grouped checkout |
| `booking_contacts`, `booking_artwork` | Customer details and private artwork metadata |
| `payment_consents`, `stripe_events`, `zone_charges` | Authorization evidence, processed events, collection ledger |
| `booking_access_tokens`, `email_outbox` | Private reservation access and durable email delivery |
| `admins`, `admin_events` | Administrator authorization and operation history |
| House-artwork and mailing-evidence records | Persistent branding, proof freshness, mailing evidence |
| `private.approved_layout_templates` | Database approval boundary for layouts |

Private storage holds artwork, house artwork, and mailing evidence. Short-lived signed URLs grant scoped access. Supabase service credentials stay in server-only modules. Public clients have limited views/RLS permissions; sensitive writes pass through authenticated services or guarded RPCs.

A historical naming trap: `editions.artwork_deadline` is used for the reservation deadline; `artwork_due_at` is the separate artwork deadline. Check the mapping before changing date logic.

## Postcard generation

`lib/print/layout-v2.json` defines the new geometry; `lib/print/layouts.ts` resolves immutable campaign layout keys. Historical V1 geometry stays in `amazingmail-layout.ts`. Browser previews and Sharp exports share contained-image fitting, preserving original uploads.

- File: 9.125 × 6.125 inches; trim: 9 × 6; live: 8.75 × 5.75.
- V2 paid inventory: six 2.78″ front squares and four 2.2925″ × 2.815″ back rectangles. Ten positions at $399, under the unchanged `square_v1` business model.
- House: 3.7375″ × 2.4825″, above the unchanged 3.925″ × 3.33″ postal exclusion with a 0.125″ gap.
- Output: 7300 × 4900 pixels at 800 DPI. Minimum source resolution for readiness: 300 effective DPI at its actual contained size.
- Existing V1 campaigns retain their 2.5″ square positions and original house geometry. Their reservations and layout keys are never migrated automatically.
- Existing normalized house images can be contained in either panel; missing/corrupt house artwork leaves a safe preview fallback. Artwork replacement still invalidates older final proofs.
- New V2 crops are optional and explicitly previewed/approved. Keeping the full image is the default, including square artwork in a portrait slot.

Reservation geometry approval is not printer or mailing-service approval. The supplied template URL `/1/` is actually the back; `/2/` is the front. A 9 × 6 finished card does not meet the usual EDDM Retail length/height thresholds; the selected product/service still requires printer confirmation. No indicia is invented.

See [the V2 audit, exact coordinates, preservation strategy and migration/rollback procedure](docs/postcard-layout-v2.txt). The additive migration must be audited and applied before deploying V2 source; production rollout is not performed by local verification.

## Code map

| Directory/file | Role |
| --- | --- |
| `src/app/` | Next.js pages, route handlers, server actions, global styles |
| `src/components/` | Existing design-system primitives and interactive booking/admin/artwork components |
| `src/lib/catalog/` | Four-area definitions and public campaign queries |
| `src/lib/booking/` | Product definitions, availability, holds, grouped checkout |
| `src/lib/artwork/` | File validation, upload authorization, crop rules |
| `src/lib/checkout/` | Card setup, reservation confirmation, cancellation, webhook handling |
| `src/lib/access/` | Account-free hashed reservation tokens |
| `src/lib/admin/` | Admin authorization, input validation, campaign/readiness logic |
| `src/lib/payments/` | Disabled-by-default collection and recovery |
| `src/lib/email/` | Email templates, Resend transport, outbox processing |
| `src/lib/print/` | Approved reservation geometry and image generation |
| `src/lib/supabase/` | Server/admin clients and database TypeScript types |
| `src/lib/dev/` | Explicitly local fake-card/test-reservation support |
| `src/lib/security/`, `src/proxy.ts` | Headers, session refresh, retired-route redirects |
| `supabase/migrations/` | Schema, RLS, triggers, RPC history |
| `tests/`, `tests/database/`, `e2e/` | Unit, SQL, integration, and browser verification |
| `scripts/` | Local verification, fixture tooling, database utilities |
| `next.config.ts`, `vercel.json` | Framework settings, headers, deployment integration and cron schedule |

## Public discovery metadata

Canonical marketing pages and published policies are registered in `src/lib/seo.ts`. Their sitemap `lastmod` values come from `src/lib/content-dates.ts`: update only the entries whose main content, links or structured data materially changed. Never replace these editorial dates with a request or deployment timestamp. The November 13, 2026 dates reflect the shared Organization address update on every public page.

The owner-supplied business address lives in `src/lib/support.ts` and is shared by Contact, About and Organization schema. No external profile URLs have been verified; the homepage belongs in `url`, not `sameAs`. Add `sameAs` only when the owner supplies actual official external profiles.

`/robots.txt` declares `Content-Signal: search=yes, ai-train=no`. `/llms.txt` provides a public site guide; `/index.md` is the Markdown homepage. The homepage also returns Markdown for explicit, preferred `Accept: text/markdown` GET/HEAD requests. Browser requests retain HTML; negotiated Markdown uses `private, no-store` and `Vary: Accept`. The public branch in `src/proxy.ts` runs before administrator authentication. Do not broaden it to private routes. Public summaries share steps, FAQs, prices and release messaging with the HTML source in `src/lib/marketing-content.ts`.

Run `npm run test:seo -- http://localhost:3000` against a local build to verify HTML metadata, schema, links, dates, robots, llms.txt and Markdown negotiation. The explicit `--production` flag allows the same read-only audit only on `https://inside914.com`.

## Local verification

Use the existing isolated Supabase runtime. The wrapper locates that runtime's credentials, explicitly selects localhost, disables external Stripe/Resend credentials, and uses fake-card reservations. It does not migrate production or deploy.

```sh
node scripts/verify-local-mvp.mjs typecheck
node scripts/verify-local-mvp.mjs lint
node scripts/verify-local-mvp.mjs test
node scripts/verify-local-mvp.mjs test:integration
node scripts/verify-local-mvp.mjs test:e2e
node scripts/verify-local-mvp.mjs build
```

Run database and browser suites sequentially because they share local fixtures. Do not substitute production credentials. A local build still uses Next's production compilation mode; it is not a deployment. Keep `.env.local`, backups, exports, screenshots, logs, and credentials out of Git.

Fresh local seeding creates only the four zones, with household estimates unset. It creates no open campaigns or reservations; use the administrator workflow for current campaigns. The integration/browser suites separately install their historical catalog compatibility fixtures through a localhost-only setup. Those fixtures are not launch inventory or print approval. To verify migrations and seeding without resetting existing data, `python3 scripts/replay-local-migrations.py` uses a new local database and retains it for inspection.

Vercel Git deployment is currently disabled in the checked-in configuration for `main` and `revision/shared-postcard-mvp`. Deployment behavior outside this repository was not inspected in this audit.

## Known limits and follow-up work

- The audit uses local fixtures and mocks. It does not certify live credentials, production data, real card authentication, delivery, or printer acceptance.
- npm reported zero advisories for production dependencies on 2026-10-22. The complete development toolchain reported 35 affected package entries (1 critical, 26 high, 8 moderate), principally through Vercel CLI and lint tooling. The compatible-fix dry run proposed no changes. These need a separately validated tooling update; no forced downgrade or lockfile rewrite was performed.
- Content Security Policy remains report-only. Frame denial, MIME sniffing protection, and other configured headers are enforced, but CSP must be tested with actual provider origins before enforcement.
- Email retries use a new provider key and access link per attempt. A timeout after provider acceptance can produce duplicate mail or revoke a link already delivered. Reliable reconciliation/persisted delivery payloads remain follow-up work; do not describe email delivery as exactly-once.
- Old schema objects, product types, and legacy reservation readers intentionally remain for data compatibility. Removing them requires a separate migration/data-retention decision.
- Collection remains disabled. Production rollout, printer approval, and live collection approval are separate owner decisions.
