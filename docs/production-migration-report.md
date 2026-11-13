# Inside914 production schema initialization

Completed October 18, 2026 (America/New_York), under explicit approval to apply all ten migrations, including transitional drops. Target: Inside914 production Supabase project `hsexthbomretpmqolkqw`.

## Outcome

All ten original migrations applied successfully, sequentially, through the connected Supabase migration API. Before execution, production had no public/private application objects, no recorded migrations and no storage buckets. Historical SQL files were unchanged from source commit `351aa9014ce03541cfbcd6a41245dcc79b688d1f` and had previously passed a fresh isolated PostgreSQL 17 replay.

No seed.sql, supabase/dev-data, sample records, customers, zones, editions, slots, bookings or administrator memberships were created. The only inserted configuration records are the two private storage buckets required by the approved migrations. No Vercel configuration, Auth settings, Stripe resources, Resend configuration, deployment, Git push or merge was changed.

## Read-only post-application verification

- Ten successful migration history entries.
- Sixteen public application tables plus private.hold_attempts, all with RLS enabled.
- Both catalog views (slot_availability and slot_pairs) have security_invoker=true.
- All 17 application tables have exactly zero rows.
- artwork bucket: private, 20 MiB, JPEG/PNG.
- mailing-evidence bucket: private, 10 MiB, PDF/JPEG/PNG.
- Twenty-five foreign keys, 78 check constraints and 12 unique constraints in application schemas.
- Unique active-claim index booking_slots_one_active_claim exists with released_at IS NULL predicate.
- bookings_release_slots trigger exists and releases claims after release/cancellation.
- hold_slots, extend_hold, confirm_booking and note_hold_attempt are executable by service_role, not anon/authenticated.
- Admin RPCs deny anon execution and permit authenticated execution; their existing internal admin checks remain intact.

No mutating production tests were run. This confirms schema installation, not an operational deployed booking flow. Empty catalog tables mean there are no campaigns for the website to display yet.

## Migration history mapping — required before future CLI pushes

The Supabase CLI lacked a Management API access token, so no CLI push was performed. The connector generated new UTC version numbers while applying the exact original SQL under its original descriptive name. Original repository filenames and SQL were preserved. The version prefix 20261019 reflects UTC; execution was still October 18 in New York.

Do not blindly run db push from the original checkout: its original version timestamps differ from production's recorded timestamps. Before the next production schema change, reconcile history in a separately reviewed workflow, or use the same connector workflow with this explicit mapping. Do not reapply these ten migrations, silently rename historical files, or repair remote history without review. No history repair was performed here.

| Original migration file | Recorded production version | Original file SHA-256 |
|---|---|---|
| 20261016040006_catalog.sql | 20261019010920 | `5a0b07292d7480579cbf671a889d541819db5afdadb1993e3f8d902e8b690b8b` |
| 20261016040245_catalog_public_read.sql | 20261019010927 | `5ff17acde8cfedc3b79e09c873a0002dae08a928dc79f0ebde4cf23089fd90a6` |
| 20261016043850_reservations_hold.sql | 20261019010931 | `59e9b577146e301fa9d3c4ed6e8c6d7f12b07aeb0c48d9c0639116aa0d2a88fa` |
| 20261016045929_bookings_multi_slot_hold.sql | 20261019010938 | `2d3bf7608ed5c96ac607b42548ca095d6b3d2e263ccf7ef41d43266595c8a525` |
| 20261016053626_artwork_storage_and_hold_extension.sql | 20261019010942 | `d61d8a3e4fae24757b355fa250322dee88ca68f27103b0cdfff67a84fcaa74c3` |
| 20261016184224_checkout_and_confirmation.sql | 20261019010951 | `86aaf463522747e0b93dd84899ddbff5c06abea1a3c2a0f00dcfe4b8d1a2e354` |
| 20261017035938_slot_occupancy_and_hold_rate_limit.sql | 20261019011109 | `bc1759c9a50c17a93973cb49cae802b8794feaa4f1b599554b98cfae2ad387ee` |
| 20261017041155_server_pricing_and_setup_status.sql | 20261019011117 | `3f0d5efe328f85a58488c83d794696857724765607e742297f430634a702902d` |
| 20261017041706_consent_amount_any_price.sql | 20261019011120 | `abd6c07b0840f3a128613efd2695bd634a8c4ca826e492403ae2a17c58a1346c` |
| 20261018000221_admin_operations.sql | 20261019011123 | `6ec907fda1a053a3982387ade6024470dbea1cc43d1cd768ec4a8f5c81cc5948` |

## Hosted advisor findings

Security advisors reported warnings, not a clean bill of health:

- Ten authenticated SECURITY DEFINER admin RPC warnings. These functions intentionally gate access through private.require_admin(), with fixed search paths. Do not revoke authenticated execution indiscriminately; it would break the designed admin path.
- public.rls_auto_enable() is also flagged as executable by anon/authenticated. Read-only inspection shows it returns event_trigger and auto-enables RLS on created public tables. This function is absent from the ten repository migrations. The generic advisor's REST-callability claim should not be treated as proof of an exploitable RPC for an event-trigger return type. Review its hosted-project privileges separately; no extra revokes were authorized or applied.
- Informational: private.hold_attempts has RLS with no policies, matching its private server-only design.

[Public security-definer remediation](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) · [Authenticated security-definer remediation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) · [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Performance informational findings: ten unindexed foreign keys (mostly admin/reviewer references), no primary key on private.hold_attempts, and fourteen unused indexes on the new empty schema. None were modified as part of this exact migration-only approval.

[Unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) · [No primary key](https://supabase.com/docs/guides/database/database-linter?lint=0004_no_primary_key) · [Unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Stop boundary

Stopped after applying and verifying the approved schema. Next work remains separately authorized: Vercel credentials/environment configuration, production Auth configuration, first-admin bootstrap, real owner-approved catalog data, webhook/email connectivity and deployment. No credentials were printed or committed in this operation.

## Campaign operations release — October 20, 2026

Applied only `20261020045228_campaign_operations_house_artwork.sql` after a fresh 35-migration content audit and verified logical database backup. Production records it as `20261020052758_campaign_operations_house_artwork`. SQL MD5: `b22c03e55905ba8e7a0b6aa31f64ad23`; source SHA-256: `b553181592892d5d5288b2bff3d7c9db9424aebbadcfdf545d318a95ee68b3fb`.

Verified the private PNG bucket, house-artwork RLS/admin-only read policy, restricted RPC execution and fixed search paths, and enabled mailing-readiness trigger. Campaign and booking row digests remained identical before/after application. Central and Eastern remain open with one confirmed reservation each; Northern and Southern still have no campaigns. No blind database push or history repair was performed.

Backup verification read the complete custom archive and restored campaign/booking data into temporary local tables with exact matching digests. Database backups do not include Storage file bytes. The backup remains private and outside Git. This release preserves `LIVE_COLLECTION_RELEASED=false` and production `INSIDE914_COLLECTION_MODE=disabled`. No Stripe operations are part of release verification.

## Admin campaign area correction — November 12, 2026

The owner approved “Apply migration and release fixes.” Applied the exact local `20261113043000_admin_campaign_area_correction.sql` through the Supabase migration connector. Production records it as `20261113045055_admin_campaign_area_correction` (November 13 UTC). Source SHA-256: `72c0d9b286624143026d9aa208590b7de6bff124271c64f3399a3006dded2666`. Historical files and remote migration records were not rewritten.

Post-application read-only checks confirmed area-change eligibility for the reported unused draft, unchanged campaign values, restricted private helper execution, and retained administrator guards and empty search paths. No customer or campaign rows were changed. See `docs/admin-debug-audit-2026-11-12.md` for regression coverage and remaining provider-test limits.
