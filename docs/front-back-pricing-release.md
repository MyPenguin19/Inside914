# Front/back placement pricing — November 16, 2026

The owner requested $399 for each of the six front positions and $349 for each of the four smaller back positions, across the public website, admin, reservation logic and backend, followed by merge, GitHub push and deployment. The existing visual design is retained.

## Behavior

- New square campaigns default to front 39900 cents / back 34900 cents. Administrators can edit both independently; values are validated as positive integer cents.
- The migration brings all four active production campaigns to those prices for new reservations. Two previously offered $1 positions. Completed, cancelled and archived campaigns are not repriced.
- The database derives the amount from the actual selected slot. Browser-supplied prices cannot override it. Mixed-area selections total their individual front/back amounts.
- Each new hold snapshots both offered prices. Moving between sides before payment setup changes the amount to the appropriate snapshot, without extending the hold or losing artwork/contact details. Once payment setup or consent starts, changing tiers requires a new hold. A failed change leaves the original claim intact.
- Existing bookings, accepted consents and payment ledgers retain their agreed amounts. Collection, receipts and recovery notices continue using the stored booking/ledger amount, independently for each area. No live collection is enabled by this release.
- Homepage, pricing page, postcard explanation, FAQ, reservation summaries, invitation previews, Markdown homepage and Service offers describe the two prices. Relevant sitemap dates were updated.

## Verification

- TypeScript, ESLint and production build pass.
- 657 unit tests pass.
- 206 integration tests pass; three real-Stripe tests are skipped without test provider credentials. All database and payment tests use the isolated local stack and simulated provider references.
- 75 browser scenarios pass across checkout, position changes, admin operations, public SEO and accessibility. The full run had one test-only decimal formatting mismatch (`299.50` versus the form's `299.5`); corrected and both campaign-management scenarios passed on rerun.
- A separate production-build browser run passed 16 scenarios. Its fake-card checkout was intentionally unavailable because production builds disable the development payment simulator; that complete flow subsequently passed in local development mode.
- Fresh isolated migration replay passes, including schema/RLS checks. Existing production definitions of the seven replaced functions matched the reviewed migration sources before release.
- The mixed-price payment fixture confirms six front obligations and four back obligations totaling $3,790. The same suite verifies customized campaign prices, consent matching, idempotency, webhook safeguards, partial payment readiness and archive preservation.
- Mobile pricing was visually inspected. Responsive, keyboard, reduced-motion and automated accessibility checks pass; this does not claim a complete legal accessibility certification.

## Runtime maintenance

Next.js and its ESLint configuration were patched from 16.4.2 to 16.4.6 after the build surfaced [GHSA-mfr8-8qww-v76h](https://github.com/vercel/next.js/security/advisories/GHSA-mfr8-8qww-v76h). The final runtime-only npm audit reports zero known vulnerabilities. The broader development dependency audit still reports 30 findings; this release does not undertake unrelated CLI/toolchain major upgrades.

## Release controls

- Production target: Supabase `hsexthbomretpmqolkqw`, Vercel `inside914` under `mypenguin19s-projects`, canonical host `https://inside914.com`.
- Migration: `20261117032918_front_back_placement_pricing.sql`. Apply only this reviewed migration through the connector; historical local/remote version mappings differ, so do not blindly run `db push`.
- Merge and push the verified source to `main` before deployment. Automatic Git deployments remain disabled for `main`.
- Stage a production build without assigning the domain, apply the required migration, verify pricing and preserved records, then promote the staged build.
- Deployment manifest excludes environment files, credentials, Git metadata, local runtime files and browser traces.
- Pre-migration baseline at `2026-11-17T03:48:38.396604Z`: 32 bookings, price digest `690e6f7634ac8ad9df4a1832d5b53224`; nine consents, amount/version digest `169284cfff92c8d41fcb060471730dc6`. Compare only rows created before this cutoff if new legitimate reservations arrive during release.
- Previous production deployment: `dpl_3QPRB41Km7FqezxJ7UR8B21wjpbC`. The schema addition is compatible with the prior app, but rolling back the app alone would restore misleading single-price displays. Prefer a forward fix or pause affected campaigns while recovering; do not delete price snapshots or rewrite accepted amounts.

Production application and deployment evidence will be recorded after release.
