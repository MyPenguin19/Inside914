# Implementation Plan: Launch readiness

Source: production-readiness review of `main` (2026-10-18). Covers every Critical (C) and Required (R) finding. Optional items are listed at the end and are not scheduled.

## Findings

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| C1 | Critical | Confirmation emails don't reach customers. `EMAIL_FROM` isn't set, so the code falls back to `onboarding@resend.dev`, and Resend only delivers that sender to the account owner. | `src/lib/env/checkout.ts:43`. The first real reservation's email is `failed` with `resend_403`. |
| C2 | Critical | A failed email is never retried. The retry endpoint exists, but nothing schedules it: there is no `vercel.json` cron and no `CRON_SECRET`. | `src/app/api/internal/email-outbox/route.ts:5`, `src/lib/email/outbox.ts:132` |
| C3 | Critical | Reservation links in emails would point at the per-deployment URL. `APP_URL` isn't set (Vercel has `NEXT_PUBLIC_URL`, which the code never reads), so it falls back to `VERCEL_URL` (`inside914-xxxx.vercel.app`). That URL can sit behind Vercel's login and changes on every deploy. | `src/lib/env/checkout.ts:49-52` |
| C4 | Critical | Production and development share one Supabase project. Integration and e2e tests create auth users, admin rows, campaigns and holds in the live database, and dev seed data is live. | `CLAUDE.md` ("Remote dev DB"); `e2e/admin-ops.spec.ts:19-31` |
| C5 | Critical | The live site takes real (live-mode) cards for a placeholder campaign at $1 / $2, under draft legal terms. | `src/lib/catalog/areas.ts:5-8`, `src/app/legal/[doc]/page.tsx:6`, `src/lib/checkout/terms.ts:3-5`, `src/lib/print/spec.ts:1` |
| R1 | Required | Canceling a reservation or a campaign in admin leaves the customer's card saved in Stripe and doesn't tell the customer. | `src/app/admin/admin-actions.ts:89`. The only `detach` call is `src/lib/checkout/service.ts:247`. |
| R2 | Required | The promised money path doesn't exist yet. Nothing cancels reservations when a campaign misses its deadline, and nothing charges when it fills. The terms promise both; the first deadline is 2026-12-15. | `src/app/legal/[doc]/page.tsx:22`; `CLAUDE.md` checkout rule |
| R3 | Required | There are no error pages and no error monitoring. Customers saw Next's bare "This page couldn't load". Logs are `console` only, and Vercel Hobby keeps runtime logs for about an hour. | No `error.tsx`, `global-error.tsx` or `not-found.tsx` under `src/app` |
| R4 | Required | The hosting plans don't fit a paid business. Vercel Hobby is for non-commercial use. Supabase Free has no daily backups and pauses inactive projects. | Vercel team is on Hobby; Supabase project is on Free |
| R5 | Required | There are no security headers: no CSP, no `frame-ancestors` (the payment page can be framed), and no site-wide Referrer-Policy or nosniff. | `next.config.ts` |
| R6 | Required | Supabase Auth is softer than it should be. Leaked-password protection is off (advisor). Public sign-ups should be off, since admins are added by hand. Admin MFA isn't required. | Supabase security advisor |

## Order and approach

Work is ordered by dependency and risk: stop the harm first, then infrastructure, then hardening, and flip the live switch last. Each phase is one branch and one PR. Merging needs your approval.

### Phase 0: Owner decisions and accounts (you; no code)
- [ ] **R4:** Upgrade Vercel to Pro and Supabase to Pro. This costs money, so it's your call.
- [ ] **C1:** Verify a sending domain in Resend (for example `inside914.com`; it needs DNS records). Then choose the sender, such as `Inside914 <hello@inside914.com>`.
- [ ] **C4:** Decide the production database. Recommended: a new Supabase project for production, with the current one kept for dev and tests.
- [ ] **C5 / R2:** Send the terms, privacy policy and cancellation policy to a lawyer, including card-network rules for saved cards and future charges.
- [ ] **R2:** Decide whether Inside914 itself will ever charge cards, or whether charges happen in the Stripe dashboard. This changes the project rule that reservation code never creates PaymentIntents.

### Phase 1: Email delivery (C1, C2, C3), small
- `getAppUrl()` will refuse to fall back to `VERCEL_URL` in production and will fail closed with a clear error. In production, links come only from `APP_URL`.
- Add `vercel.json` with a cron for `/api/internal/email-outbox`. Hobby allows only one run a day; Pro allows more.
- Unit tests:
  - the app-URL rule
  - the cron route refuses requests without the secret
- **You set in Vercel Production:** `EMAIL_FROM`, `APP_URL=https://inside914.vercel.app` (or the real domain) and `CRON_SECRET`.
- After deploy, with your approval, re-send the failed confirmation for the existing reservation.
- **Accept when:** a real reservation's email arrives, and its link opens `/reservation` on the public domain.

### Phase 2: Separate production database (C4), revised 2026-10-18
The Supabase org is on the Free plan with two active projects (the limit). Owner's decision: the existing `Inside914` project becomes **production only**, and dev and tests move to the local stack.
- [x] `isLocalSupabaseUrl()` is the single rule. The integration setup, `playwright.config.ts`, dev TEST reservations and `dev:clear-test-reservations` refuse any hosted project.
- [x] `CLAUDE.md` names the hosted project as production.
- [x] Deleted 11 released test holds and 2 leftover artwork files from production (owner-approved, 2026-10-18). Both reserved bookings were kept.
- [ ] **You:** install OrbStack, run `npx supabase start`, and point `.env.local`'s Supabase values at it.
- **Accept when:** integration and e2e runs refuse the hosted project, and production contains only real data plus the placeholder campaign (replaced in Phase 7).

### Phase 3: Error pages and monitoring (R3), small. Pages done 2026-10-18; monitoring deferred by the owner
- Add branded `src/app/error.tsx`, `global-error.tsx` and `not-found.tsx`, with Retry and Back actions and no internal details.
- Monitoring:
  - Recommended: Sentry. It's a new dependency, so it needs your approval.
  - Alternative: a Vercel log drain (Pro).
  - Either way, scrub customer data before sending.
- **Accept when:** a forced client error shows the branded page and appears in monitoring.

### Phase 4: Security hardening (R5, R6), small. Headers done 2026-10-18 (CSP report-only until a clean live booking; then set `CSP_ENFORCED`)
- Add `headers()` in `next.config.ts`:
  - a CSP that allows Stripe (`js.stripe.com`, `*.stripe.com` frames and API) and the Supabase storage origin
  - `frame-ancestors 'none'`
  - Referrer-Policy `strict-origin-when-cross-origin`
  - nosniff
  - a minimal Permissions-Policy
- Run the full e2e checkout on a Preview deployment, so a too-strict CSP can't break the card form.
- **You, in the Supabase dashboard:**
  - turn on leaked-password protection
  - turn off public sign-ups
  - (recommended) turn on MFA for your admin account
- **Accept when:** the headers are present on production, the card form works on Preview, and the advisor no longer warns about leaked-password protection.

### Phase 5: Cancellation side effects (R1), medium. Done 2026-10-18 (migration applied to production)
- Write a migration: canceling a booking queues a `reservation_canceled` email in `email_outbox`, in the same transaction. It applies to admin cancel and to campaign cancel.
- After a successful cancel, the server action detaches the card in Stripe. It's idempotent, and failures are logged and retried by the cron.
- Tests:
  - integration: cancel queues one email and is safe to repeat
  - unit: detach is called once
- **Accept when:** canceling in admin frees the space, emails the customer once, and removes the card.

### Phase 6: Deadline handling (R2). Spec approved 2026-10-18 (tasks/spec-phase-6-deadlines-and-charging.md); 6A migration applied to production
- Write a short spec covering:
  - auto-cancel of reservations when a campaign misses its deadline (cron plus the Phase 5 path)
  - the charge flow, only if you choose it in Phase 0: off-session PaymentIntent for the consented amount, failure and retry emails, and an admin view
- No code until the spec is approved. This must ship before 2026-12-15.

### Phase 7: Go-live switch (C5), last
Depends on all of the above.
- Final legal text in `src/app/legal/[doc]/page.tsx`, with the draft banner removed and `TERMS_VERSION` bumped.
- The real campaign is created in admin with confirmed dates, households and layout. Set `CAMPAIGN_DETAILS_PROVISIONAL = false`.
- Use the printer's real values in `src/lib/print/spec.ts`.
- Set `INSIDE914_PRICING_MODE=launch` in Production (you set it).
- **Accept when:** an end-to-end live booking at the real price succeeds, the email arrives, and the admin sees it as payment-ready.

## Checkpoints
- **After Phases 1 and 2:** emails deliver, and production data is isolated. Then it's safe to keep testing with real cards.
- **After Phases 3 to 5:** typecheck, lint, unit and e2e (on Preview) all pass. Review with you.
- **After Phase 7:** launch.

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| CSP blocks Stripe's card form | High | Preview e2e first; start report-only if unsure |
| Moving to a new production DB loses the one live reservation | Medium | Decide its fate in Phase 2 before switching env vars |
| Hobby cron runs only daily | Medium | Upgrade to Pro (Phase 0), or accept a delay of up to one day |
| Charge flow conflicts with the current no-charge rule | High | Explicit owner decision and a spec (Phase 6) |

## Optional (not scheduled)
- Admin RLS `ALL` policies let an admin session write bookings and consents directly, bypassing the audited `admin_*` functions. Narrow them to `SELECT`.
- Artwork from abandoned holds is never deleted. Add a cleanup job.
- `startPayment` ignores the error when saving `stripe_customer_id` (`src/lib/checkout/service.ts:137`).
- The webhook answers "Invalid signature" when the secret is missing (`src/app/api/stripe/webhook/route.ts:14-16`).
- The hold rate-limit HMAC reuses `SUPABASE_SECRET_KEY` (`src/app/(public)/actions/booking.ts:33`).
- Ten foreign keys on admin columns have no index. Fine at current scale.
