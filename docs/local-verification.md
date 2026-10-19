# Inside914 local Supabase verification

All work was local. No production database, Vercel, Resend, Stripe, GitHub push, merge or deployment changes were performed.

## Results

| Check | Result |
|---|---|
| Fresh migration replay | All 10 original migrations applied successfully, in order, without edits |
| Local fixtures | supabase/seed.sql applied only to this new local stack |
| Database | PostgreSQL 17.11, native Apple Silicon runtime |
| Schema verification | 10 recorded migrations; 16 public tables + private.hold_attempts; RLS enabled on all 17 |
| Storage | artwork private, 20 MiB JPEG/PNG; mailing-evidence private, 10 MiB PDF/JPEG/PNG |
| Local advisors | Security/performance: no issues reported |
| Database integration | 76 passed, 4 skipped, 0 failed (9 passed files, 1 skipped file) |
| Chromium E2E | 26 passed, 2 failed, 1 skipped |

Skipped tests are unverified, not successes. Four integration tests in tests/integration/stripe.test.ts and one browser test in e2e/checkout.spec.ts require real Stripe test-mode credentials, which are unavailable in this checkout. No live account or credentials were used. The simulated-card full booking browser flow passed.

The two E2E failures are:

- e2e/admin-ops.spec.ts:93 — production, payments readiness, artwork queue and new pages render and fit a phone.
- e2e/admin.spec.ts:99 — admin pages fit a phone screen.

Both fail the same assertion on /admin/payments: document width exceeds the 375-pixel viewport by 21 pixels. Admin login, campaign creation/editing/blocking, catalog, private artwork upload/editor, booking, demo and homepage checks otherwise passed. The layout was left unchanged because this request was infrastructure setup and verification. Failure contexts are retained in the checkout's git-ignored test-results directory.

## Isolation and current local state

The stack is running and listens on loopback only:

- API/Auth/Storage: http://127.0.0.1:54321
- PostgreSQL: 127.0.0.1:54322
- Local captured mail: http://127.0.0.1:54324

Runtime/cache/data are contained in work/supabase-runtime. No system-wide Docker install was needed. The repository's pinned Supabase CLI 2.121.0 supports the experimental native runtime through SUPABASE_EXPERIMENTAL_STACK=1. Realtime, Functions, Studio, analytics and pooler were excluded; database, REST, Auth, Storage and local captured mail ran eagerly.

The repository's git-ignored .env.local contains only newly generated local Supabase keys, test pricing, fake-card mode and localhost APP_URL. It has file mode 0600. No Stripe or Resend keys were configured. The Playwright-managed app server stopped after the tests; Supabase remains available. Test-created data is isolated local fixture/test data and is not production data.

## Repeat or stop locally

From the checkout:

```sh
cd /Users/gela/Documents/Codex/2026-10-18/we-x20/work/Inside914
export PATH=/Users/gela/.local/node/bin:$PATH
export SUPABASE_EXPERIMENTAL_STACK=1
export SUPABASE_HOME=/Users/gela/Documents/Codex/2026-10-18/we-x20/work/supabase-runtime

npm run test:integration
npm run test:e2e

# Inspect status locally; output includes LOCAL credentials, so do not share it.
npx supabase status

# Stop this local stack without deleting its data:
npx supabase stop

# Resume if stopped:
npx supabase start --runtime native --exclude realtime,functions,studio,analytics,pooler --eager
```

Do not run a reset or destroy to repeat tests; ordinary suites manage their own fixtures. Do not use --linked, a remote project reference, or production secrets for these commands. The automated suite guards reject non-loopback database URLs and live Stripe/Resend delivery keys.

## Remaining work

1. Resolve the /admin/payments mobile overflow in a separate local UI fix if desired, then rerun the two affected E2E checks.
2. Supply intended Inside914 Stripe TEST credentials securely to run the four real-Stripe integration tests and the real-card E2E flow. Fake mode must be disabled for that separate browser run. No live charges are involved.
3. Production schema initialization, Vercel environment settings, Auth/admin bootstrap, real catalog configuration and deployment still require their previously documented approvals. The successful fresh replay removes the earlier migration-validation blocker; it does not authorize any production operation.

The original ten historical migration files remain unchanged. No SQL dependency correction was required on this fresh PostgreSQL 17 Supabase stack.

Reference: [Supabase native runtime documentation](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes).
