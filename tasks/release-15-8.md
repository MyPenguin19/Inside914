# Task 15.8: Stabilization and release candidate

Branch `task-15-8/stabilization`, based on `task-15-7/cleanup`. That branch already contains task-15-2, 15-3, 15-4, 15-5, 15-6a and the cleanup. Report date: 2026-10-18.

## Status: INCOMPLETE (blocked)
The database integration tests and the Playwright end-to-end tests could not run. Docker/OrbStack isn't installed on this Mac, and the test guards correctly refuse the hosted (production) database. Per the definition of done, the task stays incomplete until those suites run green on the local stack.

## Fixed
1. **Cancellation emails claimed the card was removed before it was.**
   - The admin cancel ran the email and the Stripe detach in parallel, and campaign cancel sent emails first. The email always said "your saved card has been removed".
   - Now cards are removed first and emails go second (`src/lib/checkout/cancellation-followup.ts`), and the wording follows the real state:
     - `removed`: has been removed
     - `pending`: can no longer be charged; is being removed
     - `none`: no card mentioned
   - The daily job also removes cards before sending emails.
   - Admin shows "removal pending" or "removed at…" on cancelled bookings.
2. **Error-page claim checked, not changed.** The brief said `retry` is unsupported. Next 16.4.2 (`node_modules/next/dist/client/components/error-boundary.js`) passes **both** `reset` and `retry` to `error.tsx` and `global-error.tsx`, and its docs recommend `retry`, which re-fetches server data before re-rendering. Switching to `reset` would make "Try again" re-render the same server error. Kept `retry`, and added proof:
   - a real-browser check: the page failed, the cause was fixed, "Try again" was clicked, and the page recovered with no internal text shown
   - unit tests for `global-error`: its own document, no leak, and the button calls `retry`

## Files changed in 15.8
| File | Change |
|---|---|
| `src/lib/checkout/cancellation-followup.ts` (new) | Removes cards, then sends emails. Never throws; failures are left for the daily job. |
| `src/lib/email/reservation-cancelled.ts` | `card` field: wording for removed, pending or none |
| `src/lib/checkout/reservation.ts` | The view exposes `card`, from `stripe_payment_method_id` and `card_removed_at` |
| `src/lib/email/outbox.ts` | Passes `card` to the cancellation template |
| `src/app/admin/admin-actions.ts` | Single and campaign cancel use the ordered follow-up |
| `src/app/api/internal/email-outbox/route.ts` | Daily job: card removals before emails |
| `src/lib/admin/data.ts`, `src/lib/admin/metrics.ts`, `src/components/admin/reservation-actions.tsx` | Admin sees the saved-card removal state on cancelled bookings |
| `tests/cancellation.test.ts`, `tests/cancellation-followup.test.ts` (new), `tests/error-pages.test.tsx` | Regression tests |

## Test results
| Check | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed (exit 0) |
| `npm test` | **220 passed**, 24 files |
| `npm run build` | Passed |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run test:integration` | **NOT RUN.** No local Supabase stack (no Docker) |
| `npm run test:e2e` | **NOT RUN.** It refuses the hosted production database, by design |
| Browser checks (local dev server, read-only) | Every route answered as expected. The 404 page, error-page recovery, phone width (earlier), and the admin login redirect all behaved correctly. |

**Not exercised here, because each needs a database to write to:**
- the booking flow: hold, upload, details, card, confirm
- two customers competing for one space
- expired holds, and repeated or unauthorized submissions
- Stripe failure and email failure in a real environment
- admin login, artwork review, payment readiness, and cancelling a test reservation

These are covered by the existing integration and e2e suites and by the new database tests from 15-5 and 6A. All of them need `npx supabase start`.

## Production safety
- **Inspected (read-only):** migrations, outbox, bookings, editions, grants, RLS and advisors. Nothing in production was written, rolled back or deleted in 15.8. No Stripe calls.
- **Production database:** all migrations through `20261018133505`. It holds 3 confirmed reservations, all at the temporary price (100 cents, live keys), with confirmation emails sent, plus 1 released hold. No cancellations yet.
- **Production app:** `main` at `351aa90` (through 15-1).

**Current mismatch (live app = `main`, database = newer):**

| Database behavior | Live app today | Risk |
|---|---|---|
| `admin_cancel_booking` queues a `reservation_cancelled` email | The live outbox treats every row as a confirmation and fails with `reservation_not_ready`. The daily cron retries until 8 attempts (about 8 days), then stops. | If an admin cancels a confirmed reservation before this release, the customer gets no email and the card stays saved. **Don't cancel confirmed reservations until this release is live.** If one happens, after deploying reset that row's `attempts` (needs approval). |
| `approve_for_print` requires a full campaign | The live UI shows the generic "Something went wrong" | Safe: it blocks. The message is unclear until release. |
| Campaign cancel with reservations (missed deadline only) | The live UI only offers cancel with 0 reservations | Safe |
| `close_past_deadline_campaigns()` | The live cron doesn't call it | Holds already stop at the deadline (time-based). The campaign status stays `open` until this release. Release before **2026-12-15**. |
| `admin_events.admin_user_id` nullable | Reads only | Safe |
| `bookings.card_removed_at` | Not read | Safe |

**Versions after release:** the code expects exactly the applied schema. The types were regenerated from production and match.

**Safe deployment order** (each step needs owner approval):
1. Merge `task-15-8/stabilization` into `main`. It contains everything from 15-2 through 15-8. No migrations are needed; they're already applied.
2. After the deploy:
   - `/areas`, the error/404 pages and `/admin` load
   - the response headers include the CSP report-only header
   - the cron entry is still listed
3. Next day: check the cron ran (`campaignsClosed: 0`).
4. Do a real booking and check the browser console for CSP reports. Only then set `CSP_ENFORCED = true`.

## Remaining risks
- **Critical**
  - *Integration and e2e suites not run* on the combined code (environment blocker).
  - *Customer promises vs 6A behavior* (Task 15.9): every page and email says "not full by its deadline: cancelled". 6A lets the admin extend the deadline without telling customers or getting their consent.
- **High**
  - *Live keys with $1 / $2 temporary prices.* The 3 real reservations have consented to $1. They must never be charged more without new consent (Task 15.9 / 6B).
  - *Homepage advertises $500 / $900* while checkout charges $1 / $2 with a "temporary pricing" notice. This is inconsistent while test pricing is on.
  - *Legal pages are drafts* ("pending legal review").
- **Medium**
  - *Mismatch until release:* see the production-safety table.
  - *"Verified Mail" is promised* on the homepage, but publishing evidence to advertisers isn't built. The reservation page says "will appear here".
  - *CSP is report-only.*
  - *Leaked-password protection is off* (Supabase dashboard).
  - *No error monitoring* (deferred).
- **Low**
  - *Unknown `/legal/*` addresses return 200* with the not-found page and noindex.
  - *Hobby cron runs once a day*, so retries can take a day.
  - *`src/lib/supabase/browser.ts` is unused* (kept on purpose).

## Launch readiness
Not safe to call production-ready. The code side of 15.8 is done, but the branch should merge only after the integration and e2e suites run green on the local stack. The Task 15.9 wording issues should also be decided first, because merging activates the deadline-extension feature.

## Task 15.9: Customer policies and deadline consent alignment
1. Decide the deadline-extension policy, then make every surface say the same thing:
   - homepage FAQ, payment page, confirmed page, terms, consent text and confirmation email
   - Either email customers when the deadline moves, with an option to cancel without charge, or limit extensions to a stated maximum written into the terms.
2. Replace "your reservation is canceled" with what actually happens: the admin extends or cancels, and customers are notified either way.
3. Plan the transition for temporary-price reservations. Existing consents stay at their amount, so Charge All must use `payment_consents.amount_cents` and never the current price.
4. Show the same prices on the homepage and in checkout while test pricing is on, or switch to launch pricing.
5. Rewrite the Verified Mail copy to match what exists today, until evidence publishing to advertisers ships.
6. Lawyer review of the final terms, and bump `TERMS_VERSION`.
