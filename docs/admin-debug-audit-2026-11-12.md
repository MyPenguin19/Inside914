# Admin debugging audit — November 12, 2026

## Scope and result

Investigated campaign area editing and audited the admin workflows without changing the visual design. Local fixes are implemented and verified. The owner explicitly approved applying the migration and releasing the fixes. The exact migration was applied to production on November 13, 2026 at 04:50:55 UTC (November 12 in New York); the application release is being verified separately.

The reported campaign `a97812fd-a594-425e-b874-63228a8d5658` was inspected read-only. Its name is Southern Westchester, but its stored area is Central Westchester. It is a draft with no bookings or invitations. This audit does not move or rename that production campaign.

## Corrected defects

1. **Area edits were impossible at three layers.** The edit form disabled the dropdown, the action removed `zone_id`, and the database RPC ignored it while its trigger prohibited changes. Unused drafts now support audited area corrections. Existing booking, consent, payment, invitation, layout-upgrade or production history prevents a move. Published campaigns retain their area. Conflicting area/month combinations fail atomically.
2. **Failed saves reset dropdown choices.** React's native form reset reverted the selected area after a database validation error. Campaign forms now retain entered values when an action returns errors; successful saves redirect normally. Browser coverage reproduces a conflict, confirms the old database record remains intact, corrects the month, and verifies the eventual saved area and name.
3. **Reservation locks disagreed between the UI and database.** Both now consider active holds and confirmed reservation history. Unconfirmed ended holds no longer incorrectly lock schedule editing; confirmed history remains protected. A stale editor cannot silently discard an attempted area change when a reservation arrives.
4. **Invalid dates silently normalized.** Invalid calendar dates, out-of-range months and nonexistent New York times during the spring DST transition are rejected. Valid winter, summer and repeated fall-hour values retain their existing conversion behavior.
5. **Alert acknowledgement failures were hidden.** Database errors now reach the existing retry boundary instead of silently refreshing as though the dismissal succeeded.

No colors, typography, page layout, navigation, postcard geometry or public-page design were changed. A disabled area field has an explanatory hint.

## Verification

- Unit suite: **627 passed**. Final form/save regression rerun: **6 passed**.
- Integration suite: **203 passed, 3 skipped**. The skipped cases require real Stripe test credentials. Final admin operations rerun: **17 passed**.
- Transactional database regression: **24 checks passed**, all fixtures rolled back.
- Admin browser coverage: **20 distinct scenarios passed** across the final runs. These cover login, non-admin rejection, sign-out, navigation and narrow screens; areas; draft creation/editing; saved area persistence and conflict recovery; campaign workspace and filters; artwork review; private proofs; original downloads and ZIP manifests; pricing; layout upgrades; print exports; cancellation, archive and deletion safeguards; and square-campaign readiness.
- Type checking, lint and production build: **passed**.

Initial added browser assertions matched cached Next.js pages or its route-announcement alert. Selectors were narrowed to visible controls and the main content. The conflict scenario then exposed the genuine form-reset defect described above; that scenario passed after the fix.

All writes, synthetic users, campaign fixtures and workflow exercises were confined to the isolated local database. No live customer emails, payment attempts or production reservations were used for testing.

## Database migration

`supabase/migrations/20261113043000_admin_campaign_area_correction.sql`:

- Adds a private, transaction-scoped `change_area` operation and eligibility helper.
- Extends the existing admin management response with `can_change_area`.
- Updates the existing campaign mutation and trigger; signatures and authenticated-only RPC grants remain unchanged.
- Retains administrator checks, empty function search paths, row locking, immutable layout rules, audit events, unique area/month constraints and accepted reservation prices.
- Changes no existing campaign or customer data.

Applied after explicit owner approval as production migration `20261113045055_admin_campaign_area_correction`, corresponding to local file `20261113043000_admin_campaign_area_correction.sql`. Post-application read-only checks confirm the reported campaign is eligible for an area correction, its stored values are unchanged, private helper execution is revoked from API roles, and the public RPC administrator guards remain intact. Security advisor counts are unchanged (10 informational private-table findings, 30 guarded admin-RPC warnings, and the existing password-protection warning). Do not run a blind remote `db push` or rewrite historical migration records. Older application code remains compatible with the added database response field. Reverting the application release disables area editing again without needing to alter data.

## Production read-only checks and limits

- Supabase health advisors returned no findings.
- All exposed authenticated `admin_*` SECURITY DEFINER functions were checked for the explicit `private.require_admin` guard; none lacked it. The advisor warnings for these intentionally exposed admin RPCs and for private tables without client policies do not justify removing the guards or granting broader access.
- Supabase reports leaked-password protection disabled. This provider configuration remains a follow-up; see [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Live payment collection remains disabled. Real Stripe test-mode and production payment execution were not exercised.
- This is regression coverage of the available workflows, not a guarantee about every possible input or external-provider outage.

The satisfied remote migration approval requirement is in `CLAUDE.md`, under “Requires my explicit approval in chat”: “running migrations against a remote Supabase project.”
