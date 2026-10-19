# Inside914 infrastructure restoration — Phase 1.0

> Production update: all ten migrations have now been explicitly approved, applied and verified on hsexthbomretpmqolkqw. All application tables are empty; no seed data was run. Vercel/deployment unchanged. See `production-migration-report.md`, including the required migration-history version mapping before any future CLI push. Earlier no-production-change statements below describe the initial audit.

> Follow-up verification: a fresh isolated native Supabase stack has now replayed all ten original migrations successfully. Database integration: 76 passed / 4 Stripe-dependent skipped. E2E: 26 passed / 2 mobile-layout failures / 1 Stripe-dependent skipped. Local advisors: no issues. See `local-verification.md` for current results and local runtime commands. Earlier statements below about replay being unverified describe the initial review and are superseded by this follow-up. Production remains unchanged.

Review date: October 18, 2026. Source: `main` commit `351aa9014ce03541cfbcd6a41245dcc79b688d1f`. Local branch: `restore-infrastructure-review`. No push, deployment, remote DDL, customer creation, administrator grant, email send, or Stripe write was performed.

## Verified infrastructure

- GitHub private repository is accessible through the connector and authenticated CLI. Existing application preserved.
- Supabase `Inside914`, reference `hsexthbomretpmqolkqw`, is ACTIVE_HEALTHY in us-west-2, PostgreSQL `17.11.0.003`. Read-only inspection found zero public tables, zero migrations, and zero storage buckets.
- Existing Vercel `inside914`, project `prj_baND2hmY5OIm3T8s9HmmTYTRYutM`, team `team_zRNgaDpcjcYMDv7NGwbpzQ9J`, has a READY production deployment and domain `inside914.vercel.app`. CLI metadata listing confirmed no environment variables. The connector's environment-list endpoint returns team-scope 403; the authenticated CLI fallback succeeded. Do not create a replacement project.
- Resend: `inside914.com` is verified, sending enabled. No delivery attempted. Existing API key suitability has not been verified.
- Stripe connector exposes only LIVE account `QR.CR`. This is not evidence of Inside914 account readiness. No account-specific reads or writes followed. Inside914 test keys and webhook registration remain unverified.

## Migration order and dependencies

All ten historical files remain byte-for-byte unchanged. Static inspection found no missing predecessor or PostgreSQL 17 syntax dependency. This is NOT a verified migration replay: no local Docker/OrbStack runtime was available. Complete an isolated replay before production approval.

| Order | Migration | Purpose and dependency |
|---|---|---|
| 1 | `20261016040006_catalog.sql` | Zones, editions, slots, admins, initial view and admin check; requires Supabase Auth schema/roles. |
| 2 | `20261016040245_catalog_public_read.sql` | Moves admin check to private schema; catalog RLS and invoker view; requires 1. |
| 3 | `20261016043850_reservations_hold.sql` | Initial single-slot reservation table, locking and unique active-reservation index; requires 1–2. |
| 4 | `20261016045929_bookings_multi_slot_hold.sql` | Replaces reservations with bookings and booking_slots, atomic one/two-slot holds, slot_pairs, release trigger and unique active claim; requires 3 and its objects. |
| 5 | `20261016053626_artwork_storage_and_hold_extension.sql` | Private artwork bucket, artwork records, bounded hold extension; requires bookings and Storage. |
| 6 | `20261016184224_checkout_and_confirmation.sql` | Contacts, Stripe references, consents, hashed access tokens, events, transactional outbox, atomic confirmation; requires 4–5. |
| 7 | `20261017035938_slot_occupancy_and_hold_rate_limit.sql` | Private occupancy helper, public occupancy view, HMAC attempt records and serialized rate limiter. |
| 8 | `20261017041155_server_pricing_and_setup_status.sql` | Replaces old hold RPC signature with explicit pricing; setup status and booking pricing mode. |
| 9 | `20261017041706_consent_amount_any_price.sql` | Removes hardcoded $500/$900 consent restriction, adds consent pricing mode; requires 6 and pairs with 8. |
| 10 | `20261018000221_admin_operations.sql` | Campaign lifecycle, pause/block rules, audited admin RPCs, notes, review history, mailing evidence and private bucket; replaces hold implementation while retaining 8's signature. |

Recommendation: replay all ten, in this exact order, on an empty Supabase database. Do not skip superseded migrations 3 or 8: later migrations explicitly drop/replace their objects. Migration 4 DROPS `reservations`, its RPC/helper and a slot price column. It assumes the old reservation table is empty; it does not migrate old reservations. Other files replace views/functions or constraints. Approval must explicitly cover these transitional drops on a verified empty target. Never use this sequence as a data-preserving upgrade of an unknown populated database. If the target gains data, stop and reassess.

No migration correction was made. If isolated replay reveals a failure, preserve history and document the blocker; use an append-only correction when it can run after existing history. A failure that prevents reaching a later corrective migration needs an explicit reviewed bootstrap strategy, not a silent historical edit.

The seed contains a provisional zone, two editions (one open), and provisional slots. It contains no customers or admins, but it is still development data and MUST NOT run in production. `supabase/dev-data/` is also excluded. Historical SPEC references to `reservations` and future payments are not the implemented final model.

## Schema, grants, and storage verification

Expected final public tables (16): zones, editions, slots, admins, bookings, booking_slots, booking_artwork, booking_contacts, payment_consents, booking_access_tokens, stripe_events, email_outbox, admin_events, booking_notes, artwork_reviews, mailing_evidence. Private table: hold_attempts. Views: slot_availability, slot_pairs.

RLS is enabled for all these tables. Public catalog uses invoker views and published-edition policies; contacts, tokens and bookings have no anon grants. Sensitive hold/confirm/extension/rate-limit RPCs are service_role-only. Admin RPCs require authenticated membership through private.require_admin; search paths are fixed. Private schema must remain absent from exposed Data API schemas. Base catalog and older admin tables still permit some direct admin DML via RLS; audit RPCs are the application path, not a universal database audit trail.

Read-only production inspection confirmed postgres/public defaults currently grant table privileges to anon/authenticated/service_role. The migrations rely on some inherited grants, notably authenticated table reads and service_role writes. Recheck effective privileges after replay, including identity-sequence use. If defaults differ in a local/new project, prepare explicit least-privilege grants as an additional reviewed migration. RLS alone does not grant table access. Do not change broad defaults during restoration without a separate review.

Verify foreign keys, positive integer-cent constraints, hashed token uniqueness, booking_slots_one_active_claim, release trigger, ordered row-lock hold serialization, outbox uniqueness, event-id uniqueness, and admin authorization with the existing integration suites. Check anon/non-admin denials and service/admin intended access; inspect security/performance advisors after actual replay. Catalog helpers intentionally return availability only.

Buckets created by migrations:

| Bucket | Visibility | Limit | Types |
|---|---|---|---|
| artwork | private | 20 MiB | JPEG, PNG |
| mailing-evidence | private | 10 MiB | PDF, JPEG, PNG |

No bucket-wide browser storage policies should be added. Server checks a hold token or requireAdmin before issuing scoped signed upload/read URLs, then verifies uploaded content. After migration, inspect actual bucket flags and limits: ON CONFLICT DO NOTHING does not repair a pre-existing misconfigured bucket.

## Environment configuration

Set these separately in the existing Vercel project's Production / Preview / Development scopes. Never share production Supabase credentials with Preview or Development. Public values are embedded at build time; configuration requires a separately approved redeployment to take effect.

| Variable | Production | Preview | Local / Development |
|---|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | https://hsexthbomretpmqolkqw.supabase.co | separate dedicated nonproduction Supabase | http://127.0.0.1:54321 |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | NEW project's publishable key | preview project's key | local key |
| SUPABASE_SECRET_KEY | NEW project's server secret | preview project's server secret | local service/secret key |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY | approved account/mode; paired with secret | pk_test placeholder replaced securely | pk_test placeholder replaced securely |
| STRIPE_SECRET_KEY | approved account/mode; restricted key if sufficient | test-mode secret/restricted key | test-mode secret/restricted key |
| STRIPE_WEBHOOK_SECRET | corresponding production endpoint secret | separate test endpoint secret | Stripe CLI test listener secret |
| RESEND_API_KEY | sending key scoped to verified domain | omit by default; isolated approved delivery only | omit for tests |
| EMAIL_FROM | Inside914 <bookings@inside914.com>, owner-approved mailbox | explicit safe sender if delivery approved | placeholder; sends mocked |
| SUPPORT_EMAIL | owner-confirmed monitored address | environment-appropriate address | placeholder |
| APP_URL | https://inside914.vercel.app | stable accessible preview URL | http://localhost:3000 |
| CRON_SECRET | unique random secret, at least 32 random bytes | separate if endpoint needed | separate local value if testing route |
| INSIDE914_PRICING_MODE | launch | launch recommended; test only with test Stripe | test |
| INSIDE914_DEV_TEST_RESERVATIONS | false/unset | false/unset (guard refuses Vercel) | optional true, local database only |
| INSIDE914_HOLD_ATTEMPTS_MAX | unset (10 attempts / 10 minutes) | unset | optional test override |

Additional test-only aliases: SUPABASE_URL, SUPABASE_ANON_KEY. They must point to local Supabase. NODE_ENV, VERCEL_ENV, VERCEL_URL and VERCEL are runtime/platform indicators; do not manually spoof them. No DATABASE_URL is read by application code. CLI database credentials are separate from application environment.

Use Supabase dashboard API Keys for NEW publishable/server keys. Transfer secret values directly through Vercel dashboard secret fields or CLI stdin from a protected temporary file; never paste into chat, commit them, or put them in process arguments. Use Secret type for server credentials and Config for public values. The checked-in .env.example contains placeholders only. No old password, identity or key is reused.

Vercel CLI metadata access works in this environment. To restore connector access separately, reconnect Vercel with authorization to the existing mypenguin19s-projects team; no such reconnection is required for the verified CLI path. Do not pull production secrets into development.

## Auth and first administrator

Production dashboard Auth configuration remains to be checked/configured after approval. Set Site URL to https://inside914.vercel.app, allow only actual required redirect URLs, disable public email signup and anonymous sign-ins, and retain email/password sign-in for admins. Local config's permissive signup/confirmation settings are development settings, not production recommendations. Customer bookings use tokens and do not require Auth accounts. Configure SMTP separately if using invite/password-reset emails; the reservation Resend API integration does not configure Supabase Auth email.

After explicit identity/access approval, create a NEW Auth user through Supabase Auth administration, using a unique strong password delivered securely (or a working invite/reset flow). Do not insert directly into auth.users or reuse deleted-project UUIDs. Verify the intended user's email and NEW UUID in the new project. Then a trusted database operator may execute:

```sql
-- Approval required; replace with the verified NEW Auth user's UUID.
insert into public.admins (user_id) values ('<verified-new-user-uuid>'::uuid);
```

Verify login at /admin, authenticated admin reads and an authorized audited action in isolation, and non-admin denial. Do not give the server secret to the administrator's browser. No administrator was created or granted access in this review.

## Resend behavior and remaining configuration

confirm_booking queues one reservation_confirmed outbox row in its database transaction. Browser completion/webhook attempts immediate delivery. Missing Resend key leaves failed/due outbox work rather than undoing the reservation. Attempts are claimed for ten minutes, max eight attempts, with 2/4/8-minute exponential delays capped at six hours. vercel.json retries via /api/internal/email-outbox daily at 14:00 UTC (10:00 EDT on the review date), processing at most 20 rows. Therefore retry timestamps do not imply frequent actual delivery, and backlog may exceed a daily batch. Configure CRON_SECRET and monitor cron/outbox; any higher-frequency worker or plan change is separate approval.

Generated links use APP_URL + /r/<token>. Production requires HTTPS APP_URL and refuses the changing VERCEL_URL fallback. Verify customer links are accessible without Vercel login: current project protection is all_except_custom_domains, so explicitly check the intended public hostname and webhook/cron reachability before launch. No protection change was made.

The sender domain is already verified. Remaining: approve sender/support addresses, securely set a suitable sending API key, FROM, SUPPORT_EMAIL, APP_URL and cron secret, then verify controlled delivery outside the production database. Do not use onboarding@resend.dev for commercial delivery. The code's outbox reduces duplicates but does not prove exactly-once delivery: retry attempt keys change and token creation/revocation can differ after uncertain network outcomes. Monitor ambiguous sends; do not treat comments claiming “never twice” as a guarantee. Fake-card reservations never reach Resend.

## Stripe behavior and remaining configuration

Checkout creates/reuses a Customer and SetupIntent with usage=off_session and card-only allowed_payment_method_types. The server re-retrieves the SetupIntent and checks success, booking metadata, customer and payment method before confirm_booking. SQL verifies hold, claims, artwork, contact and matching consent. No reservation code creates PaymentIntents, charges, invoices or subscriptions. API is pinned to 2026-09-30.endive by the existing Stripe 23 SDK; no upgrade was introduced.

POST /api/stripe/webhook validates the raw-body signature. Handles setup_intent.succeeded, setup_intent.setup_failed, setup_intent.canceled, records only current-intent status, rejects older timestamps, deduplicates event IDs and attempts confirmation on success. Handler failures remove the event marker for retry (concurrent/retry crash scenarios still require integration validation). Production endpoint: https://inside914.vercel.app/api/stripe/webhook. Test listener: stripe listen --forward-to localhost:3000/api/stripe/webhook, authenticated to the intended TEST environment.

Obtain Inside914's intended account and matching test keys securely, register/verify those three events in a test environment, set its own whsec secret, and prove save-card $0 behavior with test cards on isolated Supabase. A live endpoint/key setup is a separate owner approval; never use QR.CR's live connector for development.

Future collection is absent: off-session charge orchestration after print approval, payment ledger/attempt records, payment_intent webhook reconciliation, authentication-required recovery links, receipts, retry policy and 72-hour release. Existing charge-related status values and admin payment screens do not implement those capabilities. Approve-for-print currently changes campaign state; it does not collect money. Infrastructure restoration must not be described as a complete commercial payment launch.

## Local improvements and actual validation

- Removed the deleted project from db:types and dev/fake-card cleanup allowlists. db:types now targets local Supabase. Deleted reference originally occurred in package.json, CLAUDE.md, src/lib/dev/test-mode.ts, scripts/dev-clear-test-reservations.mjs, and two fixture URLs in tests/dev-test-mode.test.ts.
- Integration setup validates every configured app/test Supabase URL before test modules load; Playwright loads Next environment configuration, validates before discovery, and never reuses an unknown existing server. Suites permit only HTTP loopback databases, reject live Stripe keys and Resend delivery keys. Dedicated remote test projects remain disabled until explicitly reviewed/allowlisted. These guards are accidental-target protections, not a security boundary against an intentionally malicious local proxy.
- Fake reservations and their cleanup are local-only. Temporary pricing refuses the production project, Vercel Production and live Stripe keys. Production must use launch, with edition prices authoritative. This protects new application holds, not arbitrary SQL by a service-role holder or pre-existing test bookings.
- Updated .env.example and CLAUDE guidance; historical SQL untouched. No business features added.
- TypeScript: PASS. ESLint: PASS. Unit tests: 19 files / 181 tests PASS, zero skipped.
- Guard probes: integration configuration pointed at production with placeholder keys -> all 10 suites rejected in setup, no tests ran; Playwright --list -> rejected before discovery. These are expected safety refusals, NOT successful database or E2E tests.
- Default npm run build: failed fetching Google Fonts under restricted network; retry reached a Turbopack port-binding permission failure. npx next build --webpack: PASS, all 41 static-page generation steps completed. Default Turbopack build remains unverified in this host. No credentials or backend connectivity were required for the successful build.
- Database migration replay, RLS/concurrency tests, private upload flow, Auth login, real Stripe test SetupIntent, webhook delivery, email delivery and full E2E: NOT RUN. No Docker/OrbStack executable/runtime was found in PATH or standard application locations. Supabase CLI initially hit a sandbox telemetry-file error; help worked with approved execution access. No production tests were substituted.
- npm ci --ignore-scripts installed locked dependencies. npm reported 35 audit findings (8 moderate, 26 high, 1 critical) and existing ESLint peer mismatches. No automatic upgrade performed; dependency audit/remediation remains separate work before commercial launch.

## Exact next operations, with approval gates

1. Provide/start a local Docker-compatible runtime. In this local checkout run npx supabase start, which applies local migrations and local seed on initial creation. Confirm 10 migration versions and the expected final schema/buckets. Review local seed only; never connect this step to production. Existing suites need its provisional fixture catalog. A reset of an existing local database is destructive and needs explicit approval; no reset is required merely to inspect a fresh stack.
2. Configure .env.local exclusively with local Supabase keys and intended Stripe TEST keys. Unset RESEND_API_KEY for automated tests. Run npm run test:integration and npm run test:e2e; record every skipped test as unverified. Exercise a real test SetupIntent/webhook and mocked email delivery. Resolve replay or privilege failures before proceeding.
3. Request approval specifically to initialize the empty production schema with all ten named migrations, including migration 4's transitional drops, creating the two private buckets, WITHOUT seed/dev-data/users/customers. Recheck emptiness immediately before execution.
4. After that approval, use the existing Supabase project. CLI 2.121.0 help confirms this reviewable sequence (credentials supplied securely through CLI authentication/prompt, never arguments):

```sh
npx supabase db push --project-ref hsexthbomretpmqolkqw --dry-run --skip-vault
# Review the exact ten pending migration files; do not use --include-seed or --include-roles.
# Execute ONLY after explicit approval and successful isolated replay:
npx supabase db push --project-ref hsexthbomretpmqolkqw --skip-vault
```

Alternatively apply each exact SQL file sequentially through Supabase's migration API with its original version/name preserved. Do not run a concatenated script without migration history. Verify schema, constraints, RLS, RPC grants, buckets and advisors with read-only queries afterward. Stop on the first error; do not reset production or blindly retry.
5. Request approval for the explicit Production variable matrix above on the EXISTING Vercel project; configure Preview/Development with separate infrastructure. Obtain new Supabase keys from this project's dashboard. Confirm Stripe account/mode and Resend sender before installing their secrets. Configure production Auth settings under explicit approval. Do not mix test prices or simulated bookings into Production.
6. Obtain separate approval for the named first administrator and execute the secure bootstrap above. Obtain approved real zone/campaign/layout/pricing data; there is no zone creation UI in the inspected routes, so initialize only owner-approved zones through a reviewed operator action. Without real catalog data /areas will remain empty; do not import seed as a workaround. Keep campaigns draft until the final print layout and commercial readiness are approved.
7. Review the local patch and obtain explicit push/deploy approval. Do not push this branch merely to share it: Git-connected branches can deploy previews. Do not merge/push main. Redeploy only after approved configuration, then check public catalog/admin login, webhook and cron access, and controlled external delivery in the isolated environment. Production customer creation is outside this approval set.

This handoff stops before all production mutations. The schema recommendation is conditional on isolated replay, not permission to execute it.

## Documentation consulted

- [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api): privileges and RLS are separate; defaults may vary.
- [PostgreSQL 17.11 Supabase release](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes): reviewed affected extensions/custom operators; migration SQL does not use the listed affected features.
- [Supabase TLS change](https://supabase.com/changelog/cbc-tls-ciphers-deprecated): modern Node 24 stack retained; no legacy cipher configuration added.
- [Stripe SetupIntents](https://docs.stripe.com/payments/setup-intents): saves payment details for later; does not collect payment.
- [Vercel environment variables](https://vercel.com/docs/environment-variables): scope configuration independently and redeploy for changes to apply.
