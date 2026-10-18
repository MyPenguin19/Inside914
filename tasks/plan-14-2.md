# Task 14.2 plan: admin operations (dependency-aware)

Base: `task-14-1/admin-foundation` (8c74334). Branch: `task-14-2/admin-operations`.

## Approach
All admin mutations are Postgres functions (`admin_*`), `security definer`, executable by
`authenticated` only, and each one:
1. calls `private.require_admin()` (same `admins` table RLS uses),
2. locks the rows it changes (`for update`), so concurrent clicks queue,
3. is idempotent (repeating an action returns `already_…`, never a second change),
4. writes an `admin_events` row in the same transaction (before/after where useful).

Server actions call them with the signed-in admin's session client (never the secret key), after
`requireAdmin()`. The only secret-key use: uploading/signing private files after `requireAdmin()`.

## Schema (one foundation migration, `…_admin_operations.sql`, NOT applied)
- `admin_events` audit log (append-only; admins can read; written only by the functions).
- `editions` + `name`, `target_quantity`, `layout_template`, `reservations_open_at`,
  `reservations_paused_at`, `artwork_due_at`, `mailing_window_start/end`, `updated_at`;
  status set extended with `mailed`, `completed` (additive; existing values unchanged).
  `artwork_deadline` keeps meaning "reservation deadline" (used everywhere today).
- Bookability in ONE place: `private.edition_is_bookable()` = open, not paused, opened, before
  deadline. Used by `slot_availability` and `hold_slots()`. Pausing stops new holds; holds already
  in checkout may still confirm; closing stops both (existing `confirm_booking` rule).
- `slots` + `blocked_at/by/reason`; blocked slots can't be held and show `occupancy = 'blocked'`.
  Blocks never count as reserved/sold.
- `bookings` + `flagged_*`, `cancelled_*`; `booking_notes` (internal notes).
- `booking_artwork` + `review_status` (pending/approved/rejected/changes_requested),
  `reviewed_*`, `review_note`; `artwork_reviews` history (keeps decisions even if the file is replaced).
  Content approval only: print readiness stays "not assessed" until printer specs exist.
- `mailing_evidence` + private bucket `mailing-evidence`; publish/unpublish recorded.

## Order and checkpoints
A. Campaign create (layout from a code-defined, provisional template) + edit rules → commit
B. Open / pause / resume / close / cancel with validations → commit
C. Inventory: slot detail, block/unblock, holds (live/expired) → commit
D. Reservations: notes, flag, protected cancel (double released atomically) → commit
E. Artwork: approve / reject / request changes, history → commit
F. Payment readiness summary (read-only; no charge button, no PaymentIntents) → commit
G. Production page (assembled postcard from approved artwork, blockers) + evidence → commit
H. Security + e2e across all of the above → commit

## Deliberately not built (later tasks)
- Customer re-upload after "changes requested" (needs a secure post-confirmation upload link).
- Showing published evidence on customers' reservation pages (customer-facing change).
- Payment collection, refunds, campaign rescheduling with customer consent.
- Marking artwork print-ready (printer specs pending).
