# Debugging audit — November 12, 2026

Scope: public pages, navigation, accessibility, SEO, reservation and artwork flows,
admin workflows, database access controls, dependency advisories, build, and live
runtime errors. Preserve the existing design. Baseline: `88a069f`.

## Confirmed application fixes

1. **Mobile navigation could close during streamed rendering.** The header's
   Suspense fallback rendered a complete second navigation tree. Resolving route
   information replaced an already-open native disclosure and lost its focus.
   The disclosure now stays mounted; only the invisible pathname observer can
   suspend. A regression test reproduces delayed route information and verifies
   element identity, open state, focus, and the active-page indicator. It failed
   before the fix and passes afterward.
2. **Admin error recovery could replay a failed server snapshot.** The retry button
   used Next's error-only `reset()` callback. It now uses the installed Next 16.4.2
   boundary's `retry()` callback, which refreshes router data as well as clearing
   the error. A regression test uses Next's actual error boundary and verifies
   that a fresh server result renders after the button is clicked. It failed
   before the fix and passes afterward.

Application classes, colors, layout, logo, and visible copy are unchanged.
Payment collection gates, production database contents, and legal text are unchanged.

## Test reliability corrections

- Cancellation unit tests explicitly configure their mocked local-only provider
  mode instead of relying on environment inherited from a wrapper. The production
  provider-blocking assertion remains in place.
- Mobile-menu queries are scoped to the header.
- The ad-space test verifies the current accessible label/pressed state and waits
  for inventory refresh to enable the new position before keyboard activation.
  It checks offline recovery, a competing hold, saved artwork, unchanged pricing,
  and preservation of other areas.
- The invitation test opens the current Advertisers & spaces workspace tab.
- The area screenshot leaves caret styles alone to avoid injecting styles while
  React is hydrating the controls.

## Verification

- TypeScript and ESLint: pass.
- Production compilation and prerendering: pass.
- Unit tests: **610 passed** across 79 files.
- Local database integration: **203 passed; 3 skipped**. Includes concurrent holds,
  row-level security, storage, consent, cancellation, and operational safeguards.
- Browser coverage: **all 97 scenarios validated** across the full initial run and
  affected-test reruns. Initial run: 93 passed, 4 failed. After fixes: 65 of 66
  affected scenarios passed; the remaining timing issue was corrected and all
  6 multi-area scenarios passed. Tests cover public and admin pages, artwork,
  invitations, mixed-layout checkout, recovery, keyboard access, and reflow.
- GET-only production SEO audit: **575 links/assets checked**, including unique
  metadata, canonical URLs, structured data, sitemap, robots, and private noindex.
- GET-only production browser audit: **32 page/viewport checks**, zero automated
  accessibility violations and zero page errors in the scanned states.
- Production error-log inspection: no error-level entries returned for the
  preceding 24 hours at audit time.

Database-writing tests ran only against the isolated loopback Supabase stack.
Production checks did not submit reservations, send mail, or charge cards.

## Dependency audit and remaining findings

The deployed application dependency tree has **zero npm audit findings**. Its
dependency versions are unchanged by this work.

Vercel's development-only dependency tree had pinned vulnerable transitive
packages. Scoped overrides apply same-major patches to tar, smol-toml, js-yaml,
AJV, path-to-regexp, Zod 4, Undici 6, and minimatch 10. The full-tree audit fell
from **44 findings (1 critical, 20 high, 23 moderate)** to **30 findings
(0 critical, 9 high, 21 moderate)**. Counts include affected parent packages.

Remaining development-tool advisories concern Undici 5 / busboy, Zod 3,
minimatch 10, and glob. Available patched versions cross their consumers' declared
major-version ranges. These were not forcibly substituted. Updating the direct
tools to the latest published versions did not resolve the findings; those
unhelpful upgrades were not retained. Revisit these overrides and remaining
advisories when upstream tools publish compatible dependency updates.

## Limits

The three skipped integration cases require actual Stripe test-mode credentials.
Local payment simulations and safety-gate tests passed; this audit does not claim
verification of real provider settlement or email delivery. Automated
accessibility scans do not establish legal ADA compliance or replace manual
assistive-technology testing. The audit verifies the exercised states, not the
absence of every possible defect.
