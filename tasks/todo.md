# Inside914 MVP — Tasks

Plan: [plan.md](plan.md) · Spec: [SPEC.md](../SPEC.md)
Every task also meets the standing Definition of Done: tests fail without the change and pass with it, typecheck + lint clean, no unrelated changes.
Standard verify = `npm run typecheck && npm run lint && npm test`.

## Phase 1: Foundation

- [x] **Task 1: Scaffold Next.js app and test tooling** (M)
  - Acceptance: Next.js App Router + TS `strict` + ESLint; Vitest and Playwright configured with one passing smoke test each; `npm` scripts from SPEC Commands exist; CLAUDE.md "Commands" section filled in.
  - Verify: standard verify; `npm run build`; `npm run test:e2e` (smoke).
  - Files: `package.json`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `src/app/page.tsx`, `CLAUDE.md`
  - Deps: none. **Ask first:** dependency list (next, react, zod, vitest, @playwright/test) and putting `~/.local/node/bin` on PATH.

- [x] **Task 2: Catalog schema, RLS, availability view, seed** (M)
  - Acceptance: migration creates `zones`, `editions`, `slots` (side, x/y/w/h inches, price_cents), `admins`, all with RLS; `slot_availability` view exposes only slot + available flag; anon can read the view and cannot read `admins`; placeholder seed of 1 zone, 1 edition and a sample grid.
  - Verify: `supabase start`; integration test using the anon client; standard verify.
  - Done 2026-10-16: verified against the remote dev project Inside914, not a local stack (Docker unavailable). 7/7 integration tests pass; security and performance advisors are clean.
  - Files: `supabase/config.toml`, `supabase/migrations/20261016040006_catalog.sql`, `supabase/migrations/20261016040245_catalog_public_read.sql`, `supabase/seed.sql`, `tests/integration/catalog-rls.test.ts`
  - Deps: 1. **Ask first:** installing the Supabase CLI.

- [x] **Task 3: Supabase clients and env validation** (S)
  - Acceptance: `env.ts` parses env with zod and fails fast; service-role client lives in a `server-only` module; browser client uses the anon key only; a client import of the server module fails the build.
  - Verify: unit test for env parsing; standard verify; `npm run build`.
  - Files: `src/lib/env.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/browser.ts`, `.env.example`
  - Deps: 2

## Phase 2: Reserve a slot

- [ ] **Task 4: Edition page with front/back slot grid** (M)
  - Acceptance: `/[zone]/[edition]` renders both sides at true 6.5:12 ratio with slots placed by inches; open, held and sold states shown with price; keyboard focusable and labelled.
  - Verify: component test; manual check against seed; standard verify.
  - Files: `src/app/(public)/[zone]/[edition]/page.tsx`, `src/components/slot-grid.tsx`, `tests/slot-grid.test.tsx`
  - Deps: 3

- [ ] **Task 5: Slot hold with double-booking protection** (M)
  - Acceptance: `reservations` table + unique partial index on active statuses; `hold_slot(slot_id)` SQL function expires stale pending holds and inserts a 15-minute hold atomically; server action returns a signed hold token; no holds after the artwork deadline.
  - Verify: integration test fires 10 concurrent holds and exactly 1 succeeds; expired hold can be re-taken; standard verify.
  - Files: `supabase/migrations/20261016043850_reservations_hold.sql`, `src/lib/booking/{hold-token,place-hold}.ts`, `src/app/(public)/actions/hold-slot.ts`, `tests/place-hold.test.ts`, `tests/integration/hold-slot.test.ts`
  - Deps: 2, 3
  - Status 2026-10-16: migration applied to Inside914 dev; advisors clean; SQL smoke test (rolled back) confirms hold, INS01/02/03, expiry re-hold and unique-index backstop. **Open:** the 10-way concurrency integration test needs `SUPABASE_SECRET_KEY` in `.env.local`. It is skipped until then.
  - Status 2026-10-16: superseded by the Task 6 booking redesign below (`bookings` + `booking_slots`, `hold_slots()`).

- [x] **Task 6 (revised): Interactive postcard booking + atomic 1-or-2-slot holds** (L)
  - Done 2026-10-16 on `task-5/slot-hold`: landing (`/`), edition booking page (`/editions/[id]`), hold page (`/book/hold`), artwork next-step placeholder (`/book/artwork`); migration `20261016045929_bookings_multi_slot_hold` + dev data `supabase/dev-data/20261016_central_westchester.sql` applied to Inside914 dev.
  - Verified: typecheck, lint, build; 37 unit/component tests; 11 integration tests (anon); 6 Playwright e2e (incl. keyboard + mobile); rolled-back SQL smoke test of standard/double holds, rollback, adjacency, expiry.
  - Secret key added 2026-10-16: all 18 integration tests pass against dev, including the 10-way race (exactly 1 of 10 wins) and doubles-vs-singles racing on overlapping slots (no slot ever claimed twice); 6 e2e pass with real holds, incl. two visitors on the same position and hold → artwork → change selection.

- [ ] **Task 6: Contact details step** (S)
  - Acceptance: form (business name, contact name, email, phone) validated by zod on client and server; saved against the held reservation; rejects an expired hold token.
  - Verify: unit tests for schema; standard verify.
  - Files: `src/app/(public)/book/[hold]/contact/page.tsx`, `src/app/(public)/actions/save-contact.ts`, `src/lib/validation/contact.ts`
  - Deps: 5

- [ ] **Task 7: Save card with SetupIntent and webhook** (M) — *high risk, early*
  - Acceptance: Stripe Customer + SetupIntent (`usage: off_session`); Payment Element shows mandate text with the slot price; `/api/stripe/webhook` verifies signature; `setup_intent.succeeded` moves reservation to `reserved` and stores payment method id; nothing is charged.
  - Verify: webhook unit test with signed fixture; manual with `stripe listen` + test card 4242; Stripe test dashboard shows $0 charged.
  - Files: `src/lib/stripe/server.ts`, `src/app/(public)/book/[hold]/pay/page.tsx`, `src/app/api/stripe/webhook/route.ts`, `tests/stripe-webhook.test.ts`
  - Deps: 6. **Ask first:** add `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`; you supply Stripe **test** keys in `.env.local`.

### Checkpoint A
- [ ] Playwright: pick slot → contact → save card (4242) → reservation `reserved`, $0 charged
- [ ] Concurrency test green · standard verify · `npm run build`
- [ ] Review with you before Phase 3

## Phase 3: Artwork

- [x] **Task 7 (revised): Artwork upload, editing and postcard preview** (L), done 2026-10-16 on `task-5/slot-hold`
  - Covers the original Tasks 8 (storage), 9 (fit-to-slot editor + resolution check); print rendering (Task 10) is still open.
  - Migration `20261016053626_artwork_storage_and_hold_extension` applied to Inside914 dev: private `artwork` bucket (20 MB, JPEG/PNG, no browser policies), `booking_artwork`, `bookings.hold_extensions`, `extend_hold()`.
  - Verified: 70 unit/component, 28 integration (real Storage + DB), 11 Playwright e2e (real uploads, keyboard, mobile, interruption).

- [x] **Task 8 (revised): Customer details, Stripe saved card, consent, confirmation, email, reservation link** (L), built 2026-10-16 on `task-5/slot-hold`
  - Migration `20261016184224_checkout_and_confirmation` applied to Inside914 dev.
  - Verified: 105 unit/component, 43 integration (real Supabase; Stripe faked), 13 e2e. **Not yet verified against real Stripe:** 4 Stripe test-mode integration tests and the e2e card test are skipped until test keys are in `.env.local`.

- [ ] **Task 8: Artwork upload to private storage** (M)
  - Acceptance: private `artwork` bucket with RLS; signed upload URL scoped to the hold; JPG/PNG/PDF only, ≤ 25 MB, checked server-side by magic bytes, not just extension; `artworks` row linked to reservation.
  - Verify: integration test rejects wrong type, oversize and another hold's path; standard verify.
  - Files: `supabase/migrations/0003_artwork.sql`, `src/app/(public)/actions/upload-artwork.ts`, `tests/integration/upload.test.ts`
  - Deps: 5

- [ ] **Task 9: Fit-to-slot editor with DPI check** (M)
  - Acceptance: crop, zoom and pan locked to the slot aspect ratio; live preview; effective DPI computed from crop size and slot inches; blocks below 150 and warns below 300; saves crop rect only.
  - Verify: unit tests for DPI and crop math (edge cases: portrait into landscape, tiny image); manual check; standard verify.
  - Files: `src/components/artwork-editor.tsx`, `src/lib/artwork/dpi.ts`, `tests/artwork-dpi.test.ts`
  - Deps: 3. **Ask first:** cropper library (e.g. `react-easy-crop`); PDF first-page preview approach.

- [ ] **Task 10: Server print render** (M)
  - Acceptance: renders original + crop to slot size × 300 px (+ bleed from `print-spec.ts`) with `sharp` on Node runtime; output stored in private bucket; re-render is idempotent.
  - Verify: unit test checks output pixel dimensions per slot size; standard verify.
  - Files: `src/lib/artwork/print-spec.ts`, `src/lib/artwork/render.ts`, `tests/artwork-render.test.ts`
  - Deps: 8, 9. **Blocked (final values):** printer bleed / color / format. **Ask first:** add `sharp`.

- [ ] **Task 11: Assemble booking flow + confirmation** (S)
  - Acceptance: order pick → upload/fit → contact → card → confirmation page ("$0 charged today, charged $X when the edition is approved to print"); back navigation keeps state; expired hold shows a clear restart.
  - Verify: Playwright full flow; standard verify.
  - Files: `src/app/(public)/book/[hold]/layout.tsx`, `src/app/(public)/book/[hold]/done/page.tsx`, `e2e/booking.spec.ts`
  - Deps: 7, 8, 9

### Checkpoint B
- [ ] Playwright full advertiser flow green · `npm run build` · review with you

## Phase 4: Access + email

- [ ] **Task 12: Email adapter and templates** (M)
  - Acceptance: `sendEmail()` with console adapter in dev; templates for reserved, approved, rejected, charged, charge failed, released, edition cancelled; reservation-confirmed email sent after Task 7 webhook.
  - Verify: unit tests render each template with required fields; standard verify.
  - Files: `src/lib/email/send.ts`, `src/lib/email/templates.tsx`, `tests/email-templates.test.ts`
  - Deps: 7. **Blocked (provider):** real adapter waits on your provider choice.

- [ ] **Task 13: Magic links and reservation page** (M)
  - Acceptance: 32-byte token, stored as SHA-256, scoped to one reservation, expires at min(14 days, deadline); `/r/[token]` shows status; allows one re-upload when `rejected` and before deadline; other reservations unreachable.
  - Verify: integration tests for expiry, wrong reservation, second re-upload refused; standard verify.
  - Files: `supabase/migrations/0004_access_tokens.sql`, `src/lib/access-token.ts`, `src/app/r/[token]/page.tsx`, `tests/integration/access-token.test.ts`
  - Deps: 8, 12

## Phase 5: Admin

- [ ] **Task 14: Admin auth** (S)
  - Acceptance: Supabase Auth email/password login at `/admin/login`; every `/admin` route and admin action checks `admins` membership server-side; non-admin gets 404.
  - Verify: integration test (non-admin user denied); standard verify.
  - Files: `src/app/admin/login/page.tsx`, `src/app/admin/layout.tsx`, `src/lib/auth/require-admin.ts`
  - Deps: 3

- [ ] **Task 15: Admin catalog management** (M)
  - Acceptance: create/edit zones, editions (month, artwork deadline) and slots (side, position, size, price); can't edit a slot that has an active reservation; grid preview reuses `slot-grid`.
  - Verify: integration tests for the guard; standard verify.
  - Files: `src/app/admin/editions/...`, `src/app/admin/actions/catalog.ts`, `tests/integration/admin-catalog.test.ts`
  - Deps: 4, 14

- [ ] **Task 16: Ad review queue** (M)
  - Acceptance: list `submitted` ads with preview; approve (renders print file via Task 10) or reject with required note; emails sent; second rejection after revision used ends in the deadline rule (open question 6).
  - Verify: integration tests for status transitions; standard verify.
  - Files: `src/app/admin/review/page.tsx`, `src/app/admin/actions/review.ts`, `tests/integration/review.test.ts`
  - Deps: 10, 12, 14

- [ ] **Task 17: Approve to print — off-session charges** (M) — *high risk*
  - Acceptance: button shows count + total; creates off-session PaymentIntents with key `charge:<reservation_id>:<attempt>`; webhook sets `charged` / `charge_failed`; clicking twice charges once; receipt email sent.
  - Verify: integration test with Stripe test mode (4242 succeeds, 4000…0341 fails); double-submit test; standard verify.
  - Files: `src/app/admin/actions/approve-to-print.ts`, `src/app/api/stripe/webhook/route.ts`, `tests/integration/approve-to-print.test.ts`
  - Deps: 7, 16

- [ ] **Task 18: Charge-failure recovery** (M)
  - Acceptance: `charge_failed` email links to `/r/[token]/pay` which confirms on-session (3DS ok); success → `charged`; after 72 h shown as expired and released on admin view or "release expired" click.
  - Verify: Playwright with 4000…3155 (3DS) and 4000…0341; standard verify.
  - Files: `src/app/r/[token]/pay/page.tsx`, `src/app/admin/actions/release-expired.ts`, `e2e/recovery.spec.ts`
  - Deps: 13, 17

- [ ] **Task 19: Cancel edition** (S)
  - Acceptance: cancel releases all reservations with no charges and sends cancellation emails; blocked once any charge exists.
  - Verify: integration test; standard verify.
  - Files: `src/app/admin/actions/cancel-edition.ts`, `tests/integration/cancel-edition.test.ts`
  - Deps: 12, 14

- [ ] **Task 20: Edition export** (M)
  - Acceptance: streams ZIP of stored print files named `<side>-<position>-<business>` plus `manifest.csv` (slot, size, business, contact, amount, status); only `charged` slots included.
  - Verify: integration test unzips and checks files vs manifest; standard verify.
  - Files: `src/app/admin/editions/[id]/export/route.ts`, `src/lib/export/manifest.ts`, `tests/integration/export.test.ts`
  - Deps: 10, 17. **Blocked (final format):** per-slot PDFs vs composed sheet.

### Checkpoint C
- [ ] Playwright: book → reject → re-upload → approve → approve to print → charged → export
- [ ] Failure path e2e green · `npm run build` · review with you

## Phase 6: Hardening

- [ ] **Task 21: Security, RLS and accessibility pass** (M)
  - Acceptance: `agent-skills:security-and-hardening` checklist applied; RLS test suite covers every table for anon / token / admin; Lighthouse accessibility ≥ 90 on booking pages; `npm audit` has no high/critical.
  - Verify: test suite green; Lighthouse report saved to `docs/`; findings fixed or recorded.
  - Files: `tests/integration/rls-suite.test.ts`, `docs/security-review.md`
  - Deps: 20

### Checkpoint D (MVP complete)
- [ ] All SPEC success criteria 1–8 verified
- [ ] `agent-skills:review` on the full diff · ready for your launch decision (deploy needs separate approval)

- [x] **Task 9 (revised): Frontend design system and full visual experience** (design preview), 2026-10-16 on `task-5/slot-hold`
  - New homepage; shared UI components; `/demo` design preview of areas, postcard selection (front/back toggle, merged double ad), editor, checkout, payment prototype (no card inputs), confirmation, Verified Mail timeline, owner dashboard. Sample data only, no backend calls.
  - Awaiting visual approval before more backend work.

- [x] **Task 10: Frontend UX refinement and visual quality audit** (design preview), 2026-10-16 on `task-10/frontend-refinement`
  - Fixed the failing Vercel preview build (/reservation read env during prerender). Journey is now 4 steps: area, space, artwork, review & reserve (details + card prototype + agreement on one page).
  - Realistic postcard (masthead, mailing panel), both sides on desktop, sticky phone bar, restored selections, editor zoom buttons and safe area, admin readiness, phone-friendly tables, token-only colors.
  - Awaiting visual approval before backend work.
