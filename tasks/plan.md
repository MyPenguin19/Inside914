# Implementation Plan: Inside914 MVP

Source: [SPEC.md](../SPEC.md) (approved 2026-10-15). Task details: [todo.md](todo.md).

## Overview
Build the reserve-now, charge-on-print booking flow for shared monthly mailers in vertical slices. The riskiest parts come first: double-booking, saving a card with $0 charged, and the off-session charge. Admin tools come last, and real email and print specs plug in when they arrive.

## Architecture decisions
- **No cron in the MVP.** Expired 15-minute holds are cleaned up in the same database function that creates a new hold. Unpaid `charge_failed` reservations show as expired after 72 hours and are released when an admin views them or clicks a release button. A Vercel Cron job can replace this later, with your approval (CLAUDE.md: scheduled tasks need approval).
- **Holds are enforced in Postgres.** A unique partial index plus a `hold_slot()` SQL function make concurrent bookings impossible to double-book, without relying on app-level locks.
- **Advertisers never get a Supabase session.** Server code checks the hold or magic-link token, then uses the service-role client, which is imported only from `server-only` modules. Anon users can read only the availability view.
- **Webhooks are the source of truth** for reservation payment status. API responses only drive the UI.
- **Print files are rendered once per approved ad and stored.** The export only zips stored files, which keeps Vercel function runtime small. Rendering runs on the Node runtime, never edge.
- **Print specs and email provider sit behind small config modules** (`print-spec.ts`, `email/send.ts`), so their open questions don't block the build. Dev uses placeholder bleed (0.125") and a console email adapter.
- **The slot grid is data, not code.** It's seeded with a placeholder grid now and replaced when you send exact sizes and prices.

## Phases (task list in todo.md)

| Phase | Tasks | Ends with |
|---|---|---|
| 1 Foundation | 1–3 | App builds, local Supabase with catalog schema + RLS |
| 2 Reserve a slot | 4–7 | **Checkpoint A:** e2e books a slot to `reserved`, $0 charged |
| 3 Artwork | 8–11 | **Checkpoint B:** full advertiser flow e2e (pick → fit → contact → card) |
| 4 Access + email | 12–13 | Magic-link page, re-upload once |
| 5 Admin | 14–20 | **Checkpoint C:** review → approve to print → charged/failed → export |
| 6 Hardening | 21 | **Checkpoint D:** security review, RLS suite, a11y ≥ 90, all green |

Parallel-safe once Task 3 is done: Task 4 (grid UI) and Task 9 (editor math + UI). Migrations always run in order, one at a time.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Off-session charge declines or needs 3DS weeks after booking | High | Mandate text at booking; pay-link recovery (Task 18); e2e with Stripe test cards 4000…0341 and 4000…3155 |
| Saved card expires before edition prints | Med | Same recovery path; admin sees failed count before export |
| Two advertisers book the same slot | High | DB-level unique partial index + `hold_slot()` function; concurrency test in Task 5 |
| Low-quality uploads print badly | Med | DPI block < 150 and warning < 300; render at 300 DPI; admin review |
| Vercel limits on large image rendering / ZIP | Med | Render per ad at approval time, store result, stream ZIP; Node runtime |
| Edition never fills | Med | Admin choice: print with house ads or cancel (no charges) |
| Sales tax obligation unclear | Med | Open question; Stripe Tax can be added to the PaymentIntent later |
| New dependencies (sharp, cropper, zod, Stripe, Playwright) | Low | Listed in Task 1/9; each confirmed with you before install, per CLAUDE.md |

## Blocked inputs (from SPEC open questions)
- Slot grid sizes + prices → replace seed in Task 2 (not blocking; placeholder grid)
- Printer bleed / color / file format → finalize Task 10 and Task 20
- Email provider + sender domain → finalize Task 12 (console adapter until then)
- Zones + household counts, edition timing defaults, sales tax → seed/admin data, not code

## Not in this plan (needs separate approval)
Vercel project linking and preview deploys, remote Supabase project, Stripe live mode, cron jobs, custom domain.
