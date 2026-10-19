# Inside914 Phase 1.3 — integration audit and approval-ready setup

> Subsequent account update: the owner selected LIVE mode and authorized Inside914 account acct_1UROMrBuhKzV6jx4. Its existing enabled endpoint we_1UROgpBuhKzV6jx41fffdFsY targets https://inside914.vercel.app/api/stripe/webhook with the three SetupIntent events and API version 2026-09-30.endive. This verifies account access and endpoint metadata only. Live credentials remain unavailable: all three entries in the protected local handoff file are blank. No Stripe values have been installed in Vercel. Earlier test-mode/account-connection statements below describe the initial audit. No live transactions or real test-mode verification occurred.

Status: local hardening and verification completed; real Resend delivery, Supabase Auth SMTP and Inside914 Stripe test connectivity remain UNVERIFIED. They are not reported as connected. Branch: integration/resend-stripe-phase13. The uncommitted Phase 1.1 mobile fix is preserved separately in the same working tree.

## Verified account and environment state

- Resend inside914.com: verified, sending enabled; domain inspection reports verified DKIM and SPF records. API-key metadata lists qrtest and CostofHouse, with no dedicated Inside914 key. No existing key was reused, and no API key value was requested or printed.
- Stripe: the user selected Inside914. The connector still lists only QR.CR, live mode. No QR.CR account-specific calls, credentials or transactions were used. A Stripe session authorization link was offered so the owner can add Inside914 test-mode access. Its account ID and test-mode connection must be verified after that action.
- Vercel: existing inside914 project and verified inside914.vercel.app domain. A read-only HTTPS request returned 200 on that exact host. Proposed APP_URL is https://inside914.vercel.app, not a generated deployment URL. This does not prove database-backed routes work.
- Actual environment metadata: Production has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY only. Development has these two plus SUPABASE_SECRET_KEY, stored as sensitive. Preview has no variables. Production SUPABASE_SECRET_KEY, Resend, email sender/support, APP_URL, CRON_SECRET, Stripe keys/webhook secret and pricing mode are absent. No values were exposed or settings modified.
- Read-only migration metadata confirms production still has the ten originally applied migrations. The merged code also expects cancellation/card-removal and campaign-deadline migrations; they remain absent from production. No schema initialization or migration was repeated.

## Resend application integration

The existing HTTP API implementation in src/lib/email/outbox.ts remains the only application mail system. It submits from EMAIL_FROM with RESEND_API_KEY, HTML/text, recipient and Idempotency-Key. Sending from Inside914 <no-reply@inside914.com> is prepared and transport-tested with a mocked API; actual deliverability is unverified until an approved recipient is supplied and a real test is authorized.

Verified behavior in local tests:

- Reservation confirmation is queued atomically by confirm_booking, and cancellation notices are queued by their existing database functions.
- Outbox claims prevent two ordinary concurrent workers from sending the same due row. Successful rows are skipped thereafter; ordinary failed attempts are delayed and retried.
- Customer status uses sent outbox rows, not pending/failed rows. Provider acceptance is not proof of inbox delivery; there is no delivered/bounced webhook tracking integration. Fake-card reservations are explicitly preview-only and have their own UI.
- Reservation links use APP_URL plus /r/<token>. Production refuses a non-HTTPS or missing APP_URL rather than falling back to VERCEL_URL.
- Cron is already configured in vercel.json: /api/internal/email-outbox at 14:00 UTC daily, authenticated with CRON_SECRET. The job also closes expired campaigns and retries saved-card detachments; it is not exclusively an email worker.
- Claims last ten minutes, at most eight attempts; backoff is 2,4,8 minutes and then capped at six hours. A daily scheduler does not service those delays promptly and processes only 20 messages per run. This is a throughput/recovery limitation.

### Duplicate-send and recovery blockers

Current retries use `${row.id}:${row.attempts + 1}` as the provider key, generate a new random reservation link, and revoke a failed attempt's token. If Resend accepts the first message but its response is lost, the next attempt uses a different key and payload: a duplicate can be sent, and the first email's link can already be revoked. The provider's idempotency retention is 24 hours, shorter than potentially daily retries. Also, the database response from marking a row sent is not checked; an unsuccessful acknowledgement can lead to another send.

Therefore sequential success/no-op and worker-claim tests do NOT establish exactly-once delivery. This phase does not claim that ambiguous-send retries are duplicate-safe. Simply changing the key to row.id is insufficient: the changing token/body would conflict with the same key, and the provider retention window still applies.

A proper focused follow-up needs a persisted immutable payload (including a recoverable protected link), stable per-event key, provider acceptance/reconciliation state, checked database acknowledgements and a retry/reconciliation policy within the provider window. That may require an additive schema change. Because this request explicitly preserves the schema and booking/token model, no such migration or replacement email system was introduced. Resolve this before enabling automated commercial sending.

### Notification coverage

| Event | Verified code status |
|---|---|
| Reservation confirmation | Existing template, transactional queue and processor |
| Reservation cancellation | Existing template and queue |
| Campaign canceled because not full | Existing cancellation variant and queue; depends on missing production deadline migration |
| Artwork approved | No notification producer/template found |
| Artwork changes requested | Admin review state exists; notification not implemented |
| Campaign confirmed/full | No dedicated notification implemented |
| Payment successful | Not implemented; collection workflow absent |
| Payment failed | Not implemented; recovery workflow absent |
| Mailing completed | Evidence/lifecycle exists; notification not implemented |

## Supabase Auth SMTP — prepared, not changed

No connected tool exposed current Auth SMTP settings without a separate Management API credential; this checkout's CLI lacks a Supabase access token. Current SMTP status is unverified. App Resend API credentials do not automatically configure Auth email.

Approval-ready target: existing project hsexthbomretpmqolkqw, Authentication > Email > SMTP settings:

- SMTP host: smtp.resend.com
- Port: 465, implicit TLS
- Username: resend
- Password: a NEW dedicated Inside914 Auth sending-only Resend key, restricted to inside914.com
- Sender address: no-reply@inside914.com
- Sender name: Inside914

Use a different key from the application's production mail key to separate rotation and purpose. Do not put SMTP credentials under NEXT_PUBLIC_. Do not replace the app HTTP integration with SMTP. Confirm Site URL and recovery redirect allowlist separately before a controlled Auth recovery test. No password-reset/recovery UI or handler was found in the inspected application; SMTP alone does not implement that product flow. Do not claim password recovery verified.

## Stripe application audit

- Existing payment form uses elements.create('payment') and confirmSetup.
- startPayment creates/reuses a Customer and SetupIntent with usage=off_session and the booking's customer ID. Confirming re-fetches the SetupIntent and checks success, current booking metadata, matching customer and a returned payment method.
- Server-sourced booking amounts and explicit stored consent are checked again by confirm_booking. Commercial reference prices are $500/$900; launch pricing uses each edition's authoritative values. Temporary $1/$2 pricing is guarded from production/live keys.
- No application code creates PaymentIntents, charges, invoices, subscriptions or Checkout Sessions. Saving a payment method does not collect money. The test suite includes a source-level guard against adding charge creation.
- Secret/publishable mode mismatches are rejected. Missing publishable keys leave the card UI unavailable rather than constituting a verified pair. Real keys are still required for real test-mode verification.
- /api/stripe/webhook verifies the raw body signature. Handles setup_intent.succeeded, setup_intent.setup_failed and setup_intent.canceled only. Current-intent status is persisted and older events cannot overwrite a newer timestamp. Success is independently rechecked with Stripe before confirmation.
- Local database tests verify duplicate event deliveries, out-of-order status, malformed booking IDs, wrong-intent/customer protection, consent, concurrent confirmation and expired holds, using mocked Stripe. Signature tests use real SDK HMAC verification without network access.
- Sequential event deduplication passes. Crash recovery remains limited: event IDs are inserted before handling, so a worker crash can leave an event marked seen without completing it. Ordinary caught errors remove the marker, but that does not cover abrupt termination. This is a durability caveat, not verified exactly-once processing.

No Stripe endpoint was created. No test-mode customer, SetupIntent, payment method or charge was created remotely in this phase. A real $0 save-card flow remains unverified.

## Exact proposed external operations — none executed

Each item requires the requested explicit approval first.

1. In the existing Resend account, create keys named inside914-app-production and inside914-auth-production, both permission=sending_access, domain restricted to inside914.com (domain 5a98112f-305b-472d-bd6d-0161e5d09c6a). Transfer values directly through protected secret handling, never chat, logs or committed files. Do not reuse qrtest or CostofHouse keys. Creating these keys does not authorize sending mail or activating production settings.
2. In existing Vercel project inside914, Production scope only, prepare the following settings. Defer activation until duplicate-send handling and production schema compatibility are addressed. Each secret value goes directly to a Secret field or CLI stdin; never command arguments.

| Name | Proposed value/source | Type |
|---|---|---|
| RESEND_API_KEY | New inside914-app-production key | Secret |
| EMAIL_FROM | Inside914 <no-reply@inside914.com> | Config |
| SUPPORT_EMAIL | support@inside914.com, pending owner confirmation that inbox is monitored | Config |
| APP_URL | https://inside914.vercel.app | Config |
| CRON_SECRET | Newly generated 32-byte random value | Secret |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY | Verified Inside914 TEST publishable key | Config |
| STRIPE_SECRET_KEY | Matching Inside914 TEST secret/restricted key | Secret |
| STRIPE_WEBHOOK_SECRET | Exact test endpoint signing secret | Secret |

Production also needs the missing SUPABASE_SECRET_KEY and INSIDE914_PRICING_MODE=launch under separate approved configuration. No fake-card flag or temporary prices should be enabled there. This table is a prepared change set, not current configuration.

3. Apply the SMTP settings above to existing Supabase Auth only after approval and secure provisioning of the dedicated key. Do not change admin memberships or import identities.
4. After Inside914's account ID and test mode are verified, create a TEST webhook endpoint at https://inside914.vercel.app/api/stripe/webhook for exactly the three setup_intent events above, using the existing API version 2026-09-30.endive where supported. Endpoint reachability/signature handling must be tested against the corresponding deployed code before declaring it operational. Do not create payment collection event subscriptions. For local tests, use an approved test-mode Stripe listener forwarding to localhost:3000/api/stripe/webhook; its signing secret is separate from the hosted endpoint.
5. Send a single agreed confirmation/cancellation fixture only to an explicitly approved recipient. No recipient has been approved, so no real message was sent. Supabase Auth recovery also requires its own explicitly approved recipient/test.
6. Deployment is a separate final approval, not implied by key creation or environment setup. No deployment was performed.

### Preview and Development isolation

Preview remains unconfigured because there is no dedicated Inside914 nonproduction database. Never reuse production Supabase for Preview or automated tests. A future Preview needs its own database, Inside914 Stripe TEST credentials/webhook secret, stable accessible APP_URL and separate email key or mocked delivery. Preview tests that create holds/users/campaigns/uploads or handle webhooks are currently unsafe/unavailable there. Existing automated guards permit loopback-only databases, so even a future hosted Preview requires a deliberate guard review.

Local Development keeps the existing isolated Supabase and mocked email. Real Stripe tests must have fake-card mode disabled, intended-account test credentials supplied securely and account identity verified read-only before approved test writes. No new Stripe account was created.

## Local changes and tests

New Phase 1.3 changes:

- src/lib/email/outbox.ts: 30-second transport timeout; HTTP success without a provider message ID now fails rather than returning 'unknown'; corrected misleading duplicate-safety comment.
- tests/resend-transport.test.ts: four mocked transport tests for sender/key/timeout behavior, no-key refusal, missing message ID and safe error codes.
- tests/integration/stripe.test.ts: disables local fake-card mode inside the real-Stripe suite so enabling credentials cannot accidentally test the simulation.
- .env.example: prepared requested no-reply@inside914.com sender; all credential values remain placeholders.

Phase 1.1's Payments class fix and responsive E2E changes remain uncommitted and preserved; they were not introduced or merged by this phase.

Validation results:

- npm run typecheck: PASS.
- npm run lint: PASS.
- npm test: 26 files, 225 tests PASS, zero skips.
- Local integration: final run 82 PASS, 4 SKIPPED, zero failures. Initial run had one checkout fixture slot_unavailable failure from residual local test state; after the suite's own cleanup, a complete rerun passed. No production data was used.
- npm run test:e2e: 24 PASS, 1 SKIPPED, zero failures.
- Four integration tests and one E2E test requiring real Stripe TEST credentials are explicitly unverified. Simulated-card results are not presented as real Stripe verification.
- No real Resend delivery test, Auth SMTP recovery test, or remote webhook delivery test was performed.

## Remaining launch blockers

1. Inside914 Stripe account identity/TEST access and secure credentials; real-card and remote webhook tests outstanding.
2. Dedicated Resend keys, approved recipient, support mailbox confirmation and real accepted/delivered verification.
3. Ambiguous-send duplicate protection and durable webhook event recovery require review.
4. Production server/environment variables are incomplete, and production lacks two migrations expected by merged code.
5. Auth SMTP and an actual password-recovery flow are unverified.
6. Future off-session charging, payment recovery/receipts and the additional notification events are not implemented; this phase does not add them.

No external write was performed in Phase 1.3. No production credentials, data, migrations, Auth SMTP settings, Vercel variables, Stripe resources or Resend resources were changed. No push, merge or deployment occurred.

## Sources

[Resend SMTP](https://resend.com/docs/send-with-smtp) supplies the host/TLS/username configuration. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys) documents the stable key and 24-hour window. [Domain-restricted sending keys](https://resend.com/docs/api-reference/api-keys/create-api-key) supports least-privilege provisioning. [Supabase Auth SMTP](https://supabase.com/docs/guides/auth/auth-smtp) is separate from application mail.
