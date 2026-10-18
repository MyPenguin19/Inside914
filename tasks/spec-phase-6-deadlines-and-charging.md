# Spec: Campaign deadlines and charging (launch Phase 6)

Status: DRAFT for owner approval (2026-10-18). No code until approved. Must be live before the first reservation deadline, **2026-12-15**.

## Objective
Today a reservation saves a card and nothing else. Two promises have no code behind them:
- the advertising terms and consent say a card is charged **only if every space is reserved and Inside914 approves the campaign for production**;
- the terms say that if the campaign isn't full by its deadline, **reservations are canceled and nobody is charged**.

This spec defines what happens at the deadline, how cards get charged, and what happens when a charge fails.

## Owner decisions (2026-10-18)
| # | Question | Decision |
|---|---|---|
| D1 | How are cards charged? | An admin **"Charge all"** button after approve-for-print. Admin first sees exactly who is charged and how much, then confirms once. |
| D2 | Deadline passes and the campaign isn't full | **Admin decides, with a reminder.** Reservations close automatically and admin is flagged. The admin either extends the deadline or cancels the campaign. Nothing is canceled without the admin. |
| D3 | Run a partially filled campaign? | **No: full or cancel.** Approve-for-print will require every sellable space to be reserved. |
| D4 | A charge fails | The customer gets an email with a **secure pay link** and has **3 days** to pay. After that, admin decides: drop the ad, or print it anyway. |

## What happens, step by step

### 1. At the reservation deadline
- New holds already stop at the deadline (`private.edition_is_bookable()`).
- **New:** the daily job (the existing Vercel cron) moves every `open` campaign whose deadline has passed to `closed`. This is audited as an automatic change (`admin_events`, no admin user). A hold still in progress at that moment keeps its existing rule: `confirm_booking` refuses after the deadline, and its card is removed (existing code).
- **New:** the admin dashboard and the campaign page show **"Deadline passed: N of M spaces reserved"** for any closed campaign that isn't full, with two actions:
  - **Extend deadline:** pick a new date. The campaign reopens, and the change is audited. Customers aren't emailed.
  - **Cancel campaign:** today this is refused when the campaign has reservations. The new behavior cancels every reservation in one transaction, using the Phase 5 path for each one: the customer is emailed and the card removed. The cancellation email says the campaign didn't fill.
- When a campaign is full, it can be closed and approved for print as today.

### 2. Approve for print (changed)
- `admin_set_campaign_status('approve_for_print')` also requires **every sellable space reserved** (D3), in addition to today's rules: the campaign is closed and all artwork is approved. If not, it refuses with `not_full`.

### 3. Charge all (new)
- Available only for a campaign that is `approved_to_print`.
- **Preview** (nothing charged), listing each reservation with:
  - business
  - reference
  - the amount from its stored consent (`payment_consents.amount_cents`, which must equal `bookings.price_cents`)
  - its card (brand and last 4 digits, read from Stripe)
  - readiness (the existing `paymentReadinessDetail`)

  Not-ready reservations are listed and can't be charged.
- **Confirm:** for each ready reservation, the server creates one Stripe PaymentIntent:
  - `off_session: true` and `confirm: true`
  - for the consented amount, on the saved payment method and customer
  - idempotency key `inside914-charge-<booking id>-<attempt>`
  - metadata with booking, edition and consent ids

  Charges run one at a time and the page shows progress. A second click, or a second admin, can't double-charge: there's a database lock per booking, the idempotency key, and a unique charge row per attempt.
- **Outcomes**, recorded per reservation:
  - `succeeded`: the booking becomes `charged` and a receipt email is queued.
  - `requires_action` (the bank wants the customer to confirm) or a decline: the booking becomes `charge_failed`, and a "payment needed" email with a pay link is queued (step 4).
- Webhooks (`payment_intent.succeeded`, `payment_intent.payment_failed`) record the final state. The browser's word is never trusted: the server re-reads the PaymentIntent from Stripe, as `confirm_booking` already does.
- **Never charged:** test reservations (`devtest` ids), cancelled bookings, or any amount other than the consented one.

### 4. Failed charge: pay link and grace period
- The email links to `/pay/<token>`, a single-use access token stored as a hash only (like reservation links). It expires after 3 days.
- The page shows the reservation and amount, and Stripe's card form. The customer pays on-session with the same or another card, including bank confirmation (3-D Secure). Success marks the booking `charged` and sends a receipt.
- After 3 days unpaid, the admin sees **"Payment overdue"** with two actions:
  - **Drop ad:** cancels that reservation using the Phase 5 path, so the customer is emailed and the card removed. Its space stays empty or gets a house ad. Inside914 absorbs this, since the campaign is already approved.
  - **Print anyway:** keeps the ad. Collecting the money is then handled outside the app.

### 5. Emails (all through `email_outbox`; test reservations never delivered)
- `campaign_cancelled_not_full`: reservation canceled, nothing charged, card removed.
- `payment_receipt`: amount, reference, campaign, last 4 digits of the card.
- `payment_needed`: pay link, amount, 3-day deadline.

## Rule changes this requires (approve explicitly)
- **CLAUDE.md and `tests/checkout-text.test.ts`** currently forbid any code that creates PaymentIntents. New rule: PaymentIntents may be created **only** in `src/lib/payments/charge.ts`, only for an `approved_to_print` campaign, only for the consented amount, only from the admin "Charge all" action or the customer pay page. The text test is changed to enforce exactly that.
- **Live keys:** with the current live Stripe keys and `test` pricing, "Charge all" would make **real $1 / $2 charges**. Charge tests run only with Stripe test keys (`sk_test_`), on the local stack.

## Data changes (one migration, shown before applying)
- **New table `booking_charges`** with:
  - booking id, attempt number, PaymentIntent id, amount in cents, status (`processing`, `succeeded`, `failed`, `requires_action`), failure code, created by (admin or customer), and timestamps
  - unique `(booking_id, attempt)`
  - RLS: admins can read; writes happen only through functions
- **Functions:**
  - `admin_begin_charge(booking)`: locks the booking, checks readiness and the consent amount, creates the attempt row, and returns the amount and payment method
  - `record_charge_result(...)`: service role only; idempotent, newest result wins
  - `admin_extend_deadline`
  - `admin_cancel_campaign_with_reservations`
  - `close_past_deadline_campaigns()`: for the cron
- `approve_for_print` gains the full-campaign check.
- Email kinds gain the three new kinds.
- `booking_access_tokens` gains a `purpose` (`reservation` or `payment`) and an expiry.

## Delivery: three PRs, in order
1. **6A: Deadlines.** Cron closes past-deadline campaigns, the not-full flag, extend deadline, cancel a campaign with its reservations, the full check on approve-for-print, and the cancellation email. *No Stripe charging.*
2. **6B: Charge all.** Charge table and functions, preview and confirm, webhooks, receipts, and the rule change.
3. **6C: Failed charges.** Pay link page, payment-needed email, 3-day grace, and the drop / print-anyway actions.

Each PR gets unit tests and integration tests (local stack; Stripe test keys for 6B/6C), plus a browser check of the admin screens. 6B and 6C also get one end-to-end charge in Stripe **test** mode, including a declined card and a 3-D Secure card.

## Success criteria
- No reservation can ever be charged unless its campaign is full, approved for print, and its consent amount matches.
- Charging the same reservation twice is impossible, including double clicks, two admins, retries and webhooks arriving before the click returns.
- When a deadline passes, the admin is told within a day, and no customer is canceled without an admin action.
- Every outcome (charged, failed, paid via link, dropped) is visible in admin and in `admin_events`, and the customer gets exactly one email per outcome.

## Out of scope
- Refunds: done in the Stripe dashboard, and admin records a note.
- Invoices and tax documents.
- Partial-campaign runs (D3).
- Automatic retries of declined cards.

## Open questions (need answers before 6B)
1. **Statement descriptor:** what customers see on their card statement, for example `INSIDE914 POSTCARD`. This is set in Stripe.
2. **Sales tax:** is advertising on a mailed postcard taxable in New York? Ask your accountant. The spec assumes no tax line.
3. **Pricing at launch:** will `INSIDE914_PRICING_MODE` be `launch` before the first "Charge all"? Otherwise customers are charged $1 / $2.
4. **Lawyer review of the terms:** do they need to change for the pay link, the 3-day grace period, and dropped ads?
