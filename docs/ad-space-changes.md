# Changing a held ad space

Customers can select **Change ad space** from the artwork editor, each area in the cart, or the held-area summary shown when they return to `/areas`. They choose an available position and save, then review their artwork in its new position. Cancelling keeps the existing position. Starting over with all areas is a separate, collapsed action.

The customer artwork preview labels the non-bookable house panel **Reserved**. The real house artwork and print layout definitions are unchanged.

## Database and release dependency

Apply `supabase/migrations/20261103221643_change_held_ad_space.sql` before deploying this application change. Development verification applied and tested the function only on the isolated local stack; production application is a separate release step.

`change_cart_position` requires the owning cart's hashed token and an expected current slot. It locks the slots in order, then checks the booking and campaign. It updates the existing claim atomically. A taken destination or stale tab leaves the existing claim intact. Only active pending square-campaign holds can move, and the destination must be in the same campaign. Confirmed and expired reservations cannot move.

Booking ID, token, agreed price, original hold expiry, saved artwork/crop, contact details and other cart members are preserved. The function is security invoker, has an empty search path, and is executable only by `service_role`. No payment operation is involved.

## Local verification — 2026-11-03

- Type checking, lint and production build passed.
- Unit suite: 592 passed.
- Integration suite: 202 passed; 3 existing Stripe-dependent tests skipped without test-provider credentials.
- Full browser suite: 44 passed.
- New browser flow passed: offline recovery, a competing visitor taking the selected space, keyboard selection, cancellation, front/back changes, saved artwork/price/other-area preservation, refresh, and re-entry through `/areas`.
- Layout checked at 320, 375 and 1440 pixels; desktop/mobile screenshots inspected.
- Security advisors: no issues. Full advisors reported the pre-existing `zone_charges_admin_read` RLS performance warning in migration `20261019224823`; no new advisor finding.
- Live payment collection remains disabled. No production data, pricing, Stripe or email provider was changed.

Run checks with the local-only wrapper `node scripts/verify-local-mvp.mjs <script>`. This branch's native stack ID is `03f35f02a1debad64481817082c402721cd9f62f337e3e80fc3a7f827adf9bf2`; select it using `INSIDE914_LOCAL_STACK_ID` when multiple local stacks exist. The wrapper supplies local credentials and disables real payment/email providers.
