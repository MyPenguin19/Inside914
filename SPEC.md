# Spec: Inside914 MVP

Status: **Draft, awaiting approval** · 2026-10-15

## Objective

Inside914 sells ad slots in a shared monthly direct-mail piece delivered to fixed zones in Westchester County (914). A local business picks an open slot, uploads its ad image, fits it to the slot, enters contact details and saves a card. **Nobody is charged until the edition is full (or an admin decides to print anyway) and an admin approves it to print.** Inside914 staff then export print-ready files and hand them to their own printer or mail house.

Users:
- **Advertiser:** a local business owner. No account and no dashboard. Everything happens in one booking flow plus emailed links.
- **Admin:** Inside914 staff. Sets up zones, editions and slots, reviews ads, approves editions to print, exports print files.

### User stories
1. As an advertiser, I see a zone's upcoming edition as a visual 6.5" × 12" front/back grid with open, held and sold slots and their prices.
2. I pick an open slot, upload an image, then crop, zoom and move it until it fits the slot, and I see a live preview at true proportions.
3. I enter my business and contact details, save a card through Stripe, and get an email confirming my reservation with **$0 charged**.
4. If an admin rejects my ad, I get an email with their note and a link to upload a new image (once, before the artwork deadline).
5. When the edition is approved to print, my saved card is charged the slot price and I get a receipt.
6. If my card fails at charge time, I get an email link to pay within 72 hours, or my slot is released.
7. As an admin, I create zones, editions (month, artwork deadline) and slots (side, position, size, price).
8. I review each submitted ad: approve, or reject with a note.
9. When an edition is full, or when I decide to print it with empty slots filled by house ads, I click **Approve to print**, which charges every approved reservation. Or I **cancel** the edition, which releases every reservation and charges no one.
10. I export an edition as a ZIP containing a print-ready file for each slot and a CSV manifest.

## Capability map

| Module id | Responsibility | Depends on |
|---|---|---|
| `catalog` | Zones, editions, slot grid, availability (public read) | — |
| `booking` | Slot hold, artwork upload and fitting, contact form, reservation | catalog |
| `payments` | Stripe customer + SetupIntent at booking; off-session charge on approval; failure recovery | booking |
| `admin` | Admin auth, catalog CRUD, ad review, approve to print or cancel, export | catalog, booking, payments |
| `notify` | Transactional emails and magic links | booking, payments |

Build order: catalog → booking → payments → notify → admin (review/export). All five are specced in this one file because the MVP is a single flow. They can be split into `SPEC-<id>.md` files if one grows large.

## Key behavior

### Slot hold and reservation (`booking`)
- Picking a slot creates a **15-minute pending hold** so two people can't book the same slot. The hold is released if checkout isn't finished.
- In a hold's last 5 minutes the customer may renew it to a fresh 15 minutes, at most twice (`extend_hold()`); nothing extends a hold automatically.
- A database constraint enforces at most one active reservation per slot: a unique partial index on `reservations(slot_id)` where status is pending, reserved, submitted, approved, rejected (keeps the slot for one resubmission), charge_failed or charged.
- Reservation statuses: `pending` → `reserved` (card saved) → `submitted` → `approved` | `rejected` → (`submitted` again, once) → `charged` | `charge_failed` → `released`. `cancelled` applies when an edition is cancelled.
- No new bookings or uploads after the edition's artwork deadline.

### Artwork (`booking`)
- Upload JPG or PNG (PDF not supported yet), up to 20 MB, stored in a private Supabase Storage bucket via single-use signed upload URLs to server-chosen random paths; the server re-validates (signature + full decode with sharp) and deletes anything invalid.
- The editor is client-side: crop, zoom and pan inside a frame locked to the slot's aspect ratio. Only the transform (crop rectangle in source pixels) is stored; the original file is never modified.
- Effective resolution is checked against the PROVISIONAL print spec (`src/lib/print/spec.ts`): a warning below 300 ppi and a stronger warning below 150 ppi. Nothing is blocked until the printer confirms real requirements.
- The server renders the final print file at 300 DPI from the original plus the transform, using `sharp`. Bleed and safe-zone margins come from the printer (see Open Questions).

### Checkout (built in Task 8)
- Details form (business, contact, email, phone; optional website/category), validated and normalized on the server.
- Card saved with a Stripe SetupIntent (`usage: off_session`), $0 charged. An unticked consent box shows the exact amount ($500/$900); consent is stored with amount, currency, terms version, edition and SetupIntent id.
- `confirm_booking()` confirms only an unexpired pending hold whose slots are still claimed, with artwork, contact and matching consent; an expired hold is released and the saved card removed from Stripe.
- Confirmation email via an outbox (one row per booking, retried with backoff, never sent twice) with a private reservation link (hashed token, 180-day expiry, revocable).

### Payments (`payments`)
- At booking: create a Stripe Customer and a **SetupIntent** (`usage: off_session`). The checkout shows a mandate line: *"Your card will be charged $X only when this edition is approved to print."*
- On **Approve to print**: for each `approved` reservation, create an off-session PaymentIntent (`confirm: true`, `off_session: true`, idempotency key `charge:<reservation_id>:<attempt>`).
- Webhooks (`payment_intent.succeeded`, `payment_intent.payment_failed`, `setup_intent.succeeded`) are signature-verified and update status. The webhook is the source of truth, not the API response.
- Failure (decline or authentication required): set status to `charge_failed` and email a pay link that confirms the payment on-session with 3DS. After 72 hours unpaid, the slot is released and the admin sees it as empty.
- Money is stored as integer cents, in USD only.

### Advertiser access (`notify`)
- No passwords. Each email contains a magic link: a random 32-byte token, stored as a SHA-256 hash, scoped to one reservation, expiring after 14 days or at the edition deadline (whichever comes first). It allows only that reservation's actions (re-upload, pay).
- Emails: reservation confirmed, ad approved, ad rejected (with note), charged (receipt), charge failed (pay link), slot released, edition cancelled.

### Admin (`admin`)
- Supabase Auth email/password, with admin role stored in an `admins` table. Admin routes are under `/admin` and checked server-side.
- Export: a ZIP of `<zone>-<YYYY-MM>/<side>-<position>-<business>.pdf` plus `manifest.csv` (slot, size, business, contact, amount, status).

### Data access and RLS
- Every table has RLS enabled.
- Public (anon) can only read zones, editions and slots, through a view that exposes whether each slot is available. It does not expose who booked it.
- Advertisers have no Supabase session. Their actions go through server actions and route handlers that validate the magic-link or booking-session token, then use the service role on the server only.
- Admins: policies check `auth.uid()` is in `admins`.

## Tech stack
- Next.js (App Router, latest stable), React, TypeScript `strict`
- Supabase: Postgres, Auth (admins only), Storage; Supabase CLI for local dev and migrations
- Stripe: SetupIntents, PaymentIntents, webhooks; test mode only until launch
- Vercel hosting
- zod (validation), sharp (print rendering), react-easy-crop or similar (editor; to be confirmed when the dependency is added)
- Email provider: **open question**
- Node 24 (installed at `~/.local/node/bin`, which must be on PATH)

## Commands
```
npm run dev          # next dev
npm run build        # next build
npm run typecheck    # tsc --noEmit
npm run lint         # next lint / eslint .
npm test             # vitest run
npm run test:e2e     # playwright test
supabase start       # local Postgres/Auth/Storage
supabase migration new <name>
supabase db reset    # LOCAL ONLY, ask first
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

## Project structure
```
src/app/(public)/            → zone/edition pages, booking flow
src/app/r/[token]/           → magic-link reservation page (re-upload, pay)
src/app/admin/               → admin console
src/app/api/stripe/webhook/  → Stripe webhook route
src/lib/supabase/            → server/browser clients (service role server-only)
src/lib/stripe/              → Stripe helpers
src/lib/artwork/             → DPI checks, transform → print render
src/lib/email/               → templates + send
supabase/migrations/         → SQL migrations (append-only)
supabase/tests/              → RLS / policy tests
tests/                       → Vitest unit + integration
e2e/                         → Playwright
docs/                        → audit, ADRs
```

## Code style
```ts
// Server action: validate at the boundary, server-only secrets, typed result
"use server";
import { z } from "zod";

const ReserveInput = z.object({
  slotId: z.string().uuid(),
  businessName: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().min(7).max(20),
});

export async function reserveSlot(raw: unknown) {
  const input = ReserveInput.parse(raw);
  // ...
  return { ok: true as const, reservationId };
}
```
- kebab-case filenames, PascalCase components, camelCase functions, snake_case DB columns
- Server Components by default; `"use client"` only where needed (editor, Stripe Elements)
- No `any`, no `@ts-ignore` without a written reason

## Testing strategy
- **Unit (Vitest):** DPI and transform math, price totals, status transitions, token hashing and expiry.
- **Integration (Vitest + local Supabase):** reservation constraint (double-booking fails), RLS (anon can't read reservations or contacts; advertiser token can't reach another reservation), webhook handler with Stripe test fixtures.
- **E2E (Playwright, Stripe test cards):** book → upload → fit → save card; admin reject → re-upload → approve → approve to print → charged; decline card `4000 0000 0000 0341` → pay link.
- Every bug fix starts with a failing test.

## Boundaries
- **Always:** validate input with zod; RLS on every new table; integer cents; idempotency keys on Stripe writes; run typecheck + lint + tests before calling work done.
- **Ask first:** new dependencies, schema changes to applied migrations, anything touching remote Supabase/Vercel/Stripe, changing the charge flow.
- **Never:** real Stripe keys or live mode, secrets in client code, charging a card outside the Approve-to-print or pay-link flows, deploying, force-pushing.

## Success criteria
1. Two concurrent attempts on one slot: exactly one succeeds (integration test).
2. Completing a booking charges $0 and saves a reusable payment method (Stripe test mode).
3. Below 150 DPI, upload is blocked. Between 150 and 299 DPI, the user is warned. The rendered print file matches the slot size in inches × 300 px.
4. Approve to print charges each approved reservation exactly once, even if clicked twice (idempotency).
5. A declined charge sends a pay link. Paying moves the reservation to `charged`. Not paying for 72 hours moves it to `released`.
6. Anon client cannot select from reservations, contacts or artworks (RLS test).
7. Export ZIP contains one file per charged slot and a manifest that matches.
8. Lighthouse accessibility score ≥ 90 on the booking flow.

## Open questions
1. **Slot grid:** exact slot sizes, positions and prices for the front and back of the 6.5" × 12" piece (you said you'd provide these).
2. **Printer specs:** bleed (commonly 0.125"), safe zone, color (CMYK vs RGB), and file format (per-slot PDFs, or one composed PDF per side?).
3. **Zones:** names and household counts for the first zones.
4. **Email provider:** Resend, Postmark, or Supabase's built-in SMTP (rate-limited, not for production)?
5. **Edition timing:** default artwork deadline (e.g. 14 days before mail date) and how far ahead editions open for booking.
6. **Rejected ad after the deadline:** release the slot, or let the admin place a house ad?
7. **Taxes:** is sales tax charged on ad slots (NY)? This affects whether Stripe Tax is needed.
8. **Domain and sender address** for emails.
