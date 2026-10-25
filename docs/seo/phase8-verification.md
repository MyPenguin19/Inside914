# Phase 8: technical SEO verification

Date: 2026-10-25. Scope: the six public marketing URLs on `https://inside914.vercel.app`, PR #18, and indexing boundaries around private routes. Production was inspected read-only. This document describes the feature branch until an owner-authorized release occurs; it does not claim these changes are deployed.

## Confirmed findings and fixes

| Severity | Finding | Resolution / evidence |
| --- | --- | --- |
| Critical | No critical production security defect identified in this SEO scope. | Authentication, RLS, payment gates and original artwork handling unchanged. This is not a claim of a comprehensive security penetration test. |
| High | Root canonical/social URL could make child pages identify the homepage; regional titles repeated Inside914, while the homepage omitted it. | Explicit per-page metadata, absolute titles, canonical host allowlist; actual server HTML checked for all six pages. Root canonical removed. |
| High | Booking HTML lacked its own noindex metadata; robots disallow prevented crawlers from observing some HTML noindex directives. | Existing booking gate preserved with added noindex metadata. Private route prefixes get `X-Robots-Tag`; HTML remains crawlable so directives can be seen. Tokens, APIs and private evidence remain disallowed. Authentication remains the protection for data. |
| High | PR #18's Vercel Preview failed during prerender of `/book/cart/details` with missing Supabase environment variables. | Read cookies before initializing the request-only database client. Build verified with Preview credentials absent. No production credentials copied to Preview. A functioning data-backed Preview still needs an isolated nonproduction Supabase configuration. |
| Medium | Unknown `/areas/[slug]` returned not-found UI with HTTP 200 under streaming. | Four explicit static routes share one server component; unknown area paths now return HTTP 404. No broad redirects or private token rewriting. |
| Medium | Thin regional copy and absent regional structured data. | Distinct local planning guidance, existing municipality groupings, campaign process and provisional-route explanations. WebPage and BreadcrumbList connected to homepage Organization/WebSite. No fabricated reach, addresses, ratings or LocalBusiness claims. |
| Medium | Homepage suggested a specific household scale and an immediate reservation while checkout is closed. | Removed the unsupported “Thousands” headline and immediate-reservation CTA. Visible existing closed-checkout message; browse-area CTAs. All release flags remain false. |
| Medium | Lighthouse found insufficient contrast on the orange illustrative ad, including its translucent small label. | Existing dark foreground on that sample tile; opaque sample labels. No customer/house artwork changed. |
| Medium | At 200% text sizing, the header/menu, hero and pricing content could exceed a 390px screen (document width 573px). | Wrapping and minimum-width corrections in marketing content, responsive header wrapping and a bounded disclosure menu. Automated enlarged-text check on all six pages with menu open. |
| Medium | Unused Geist Mono was preloaded on marketing pages. | Removed that preload; the font remains available where used. Browser font transfer decreased by about 24 KB in the mobile lab runs. No inventory caching introduced. |
| Low | Pricing illustration stretched vertically beside its text. | Aligned the existing diagram to the start of the flex row; six-width browser assertion verifies its 9:6 ratio. Print geometry unchanged. |
| Low | Open Graph used fallback Arial and lacked the requested wording. | Actual 1200×630 PNG uses bundled licensed Fraunces/Geist fonts and requested brand/county/shared-postcard wording; no runtime font download. Explicit canonical OG/Twitter metadata and image alt text. |
| Low | Report-only CSP emitted an ignored `upgrade-insecure-requests` warning on each page. | Emit that directive only if the existing CSP enforcement switch is enabled. Current report-only/enforcement state, HSTS and other security headers unchanged. |
| Low | Sitemap claimed inferred update frequency/priority. | Six exact canonical URLs; no invented dates, frequencies, tokenized routes, draft legal pages or dynamic campaign URLs. |

## Rendered crawl and accessibility

`npm run test:seo -- http://localhost:3100` runs `scripts/audit-public-seo.mjs` against an isolated local production build. It refuses non-local hosts and only makes GET requests. The six routes must return 200 without redirects, unique nonempty titles/descriptions, one H1, an ordered heading hierarchy, correctly named images/graphics, canonical metadata and parsable schema. The crawler checks normal HTML links, policy links, off-page anchors, social image references, redirects and indexing controls. It also checks that the production-style booking page still displays the closed-checkout gate.

- Allowlist: `/`, `/areas`, `/areas/central-westchester`, `/areas/southern-westchester`, `/areas/northern-westchester`, `/areas/eastern-westchester`.
- Sitemap: valid XML/content type, six unique HTTPS URLs, no `lastmod` fabrication. Preview sitemap empty.
- Robots: production marketing crawl allowed; Preview disallows all. Preview also has global noindex response headers and root metadata.
- Canonicals/social URLs: exact approved host and corresponding route; query parameters excluded. Next.js serializes the root host without a final slash; URL-normalized it is exactly the homepage `/`.
- Draft legal policies remain noindex. Anonymous admin requests still redirect to sign-in; reservation/recovery/book/API indexing headers do not replace authorization.
- Schema: Organization names Inside914 with legalName Inside Diagnostics LLC and a Brand; WebSite references its publisher. Regional pages have linked WebPage/BreadcrumbList, ordered Home → Areas → Region. No Product/Review/AggregateRating added.
- Public graphics use CSS/SVG and reserve their space. No raster marketing-image download exists to recompress; the map retains named, keyboard-operable controls. Real artwork storage and print export code were untouched.
- All six pages checked at 320, 375, 390, 768, 1024 and 1440px. Additional 200% text sizing at 390px; keyboard menu/map controls, focus indication and reduced-motion mode checked.
- External map source reviewed separately: [NYS civil boundaries](https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Civil_Boundaries/MapServer/6). No automated external submissions.

### Production read-only observations before release

The currently deployed main does not yet contain the SEO routes: sitemap/robots and regional landing page requests returned 404; homepage/areas lacked canonical metadata. These require the separately approved release, not a production data operation.

`http://inside914.vercel.app/` → one 308 to HTTPS. `/areas/` → one 308 to `/areas`. Legacy `/editions/<id>` → one 307 to `/areas`. `/AREAS` returns 404; query variants return the page and will declare the clean canonical after release. Private legacy routes remain in place.

Existing application HSTS is `max-age=63072000`; Vercel's platform slash-redirect response additionally returned includeSubDomains/preload. No HSTS, domain, DNS or preload configuration was changed.

## Performance methodology and limits

Lighthouse 13.5.0 mobile simulation on the same Mac/Chrome host, using `next build` + `next start`, localhost:3100 and the same isolated local Supabase stack. Three representative pages: homepage, area selector, Central landing page. Baseline is the original SEO branch after merging current main; after is the completed implementation. Builds and heavy suites were not run during measurement. Raw JSON/HTML reports and screenshots are retained outside Git in the task's `outputs/inside914-phase8` folder; no production secrets or customer screenshots are committed.

Each before/after entry is a single lab navigation, not a median or a real-user measurement. Local TTFB excludes WAN/Vercel latency. Cache warm-up, browser scheduling, local fixture availability and copy changes can affect the result; the data does not isolate font loading as the only cause of LCP changes. TBT is reported as a lab measure and must not be renamed INP. No analytics or third-party tracking script was introduced.

| Page | Mobile score before → after | LCP before → after | CLS before → after | TBT before → after | Local server response before → after |
| --- | --- | --- | --- | --- | --- |
| home | 94 → 97 | 3.12s → 2.63s | 0.000 → 0.000 | 12ms → 10ms | 58ms → 2ms |
| areas | 95 → 96 | 2.86s → 2.77s | 0.041 → 0.000 | 7ms → 8ms | 16ms → 2ms |
| region | 96 → 97 | 2.77s → 2.62s | 0.000 → 0.000 | 6ms → 7ms | 2ms → 3ms |

Final accessibility / best-practices / SEO Lighthouse scores: 100 / 100 / 100 on all three measured pages. Baseline homepage accessibility was 95; baseline best-practices was 96 on all three. Font transfer: 123,148 → 98,865 bytes. Full resource breakdown is in [the compact measurement data](phase8-lighthouse-summary.json). LCP remains close to, but above, the 2.5s target in these single-run lab results. CLS is within 0.1. TBT is low, but field INP remains unavailable. No production performance or ranking improvement is claimed.

## Final QA

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| ESLint | Pass |
| Unit | 495 passed, 61 files |
| Integration | 183 passed; 3 Stripe-dependent tests skipped in one file (credentials unavailable) |
| Full E2E | 38 passed; no skips |
| Focused final marketing E2E after the diagram aspect correction | 11 passed; these are a subset of the suite, not 11 additional unique tests |
| Production build | Pass |
| Preview build with Supabase/Stripe/Resend credentials blank | Pass; actual homepage/four-region responses had noindex headers + metadata, production canonicals, disallow-all robots and empty sitemap |
| Production-build public crawler | Pass; 157 internal link/asset references, all six marketing pages and policy/private indexing checks |

An earlier full run timed out in the existing house-artwork test after a full-page screenshot, before Save. The test was rerun with diagnostics and passed in isolation; a post-screenshot enabled assertion now fails promptly if the control disappears. The subsequent complete 38-test run passed with failure tracing enabled. No house-editor application code was changed and the intermittent client error's underlying cause was not established; do not describe it as a proven editor bug fix. Reinvestigate if it recurs.

React review: marketing pages remain server components, shared regional rendering avoids duplicated implementation, static data does not add client state/effects, existing map/booking handlers are unchanged, and typography/layout edits preserve semantic controls. Full diff reviewed against main; no changes to migrations, RLS, payment/cancellation code, consents, customer artwork or print exports.

## Search Console and external work

The available Google session explicitly reported no access to the correct URL-prefix property. No ownership token was invented or published. No sitemap submitted, selected canonical verified or search impressions/rankings claimed. The public PageSpeed API returned HTTP 429 (quota exhausted); authenticated Search Console/CrUX field LCP, INP and CLS are unavailable.

Owner steps and the researched prospect queue are in [the 90-day plan](inside914-local-seo-and-backlinks.md). It covers county associations, chambers in all four groupings, merchant support, education, publication/design prospects and sponsorship evaluation, with fees only where verified. No outreach, accounts, purchases or backlinks were created. Five article briefs are proposals, not sitemap entries.

## Release boundaries and reproducibility

Full regressions use `node scripts/verify-local-mvp.mjs <script>` to supply the isolated native Supabase stack, blank Stripe/Resend credentials and disabled collection. They do not use the hosted production database. The three Stripe-dependent integration skips are unavailable-credential skips, not passes.

PR #18 was **MERGEABLE**, not conflicted; its initial UNSTABLE state was the failed Vercel preview. Latest origin/main was merged normally. The preview failure is reproduced by its build logs and corrected locally with a credential-free Preview build. Automatic deployments remain disabled on main and are explicitly disabled on this feature branch so the requested push cannot incidentally publish it. No branch protections or checks are bypassed.

Merge and controlled deployment require separate owner authorization. After authorization: re-fetch/review main, merge through PR #18, deploy the merged SHA through the existing controlled Vercel process with checkout/collection/invitations disabled, repeat the public GET-only crawl and image/mobile inspection on production, then complete Search Console verification/sitemap submission with the owner. No database migration is needed.

Safety: `PUBLIC_CHECKOUT_RELEASED=false`, `LIVE_COLLECTION_RELEASED=false`, `INVITATION_EMAIL_RELEASED=false`. Production `INSIDE914_COLLECTION_MODE=disabled` is left unchanged. No production environment updates, database writes, Stripe operations, email sending, campaigns/reservation edits, artwork-original edits or print geometry changes occurred.

References: [Next metadata](https://nextjs.org/docs/app/getting-started/metadata-and-og-images), [self-contained generated social images](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image), [Google noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [robots limitations](https://developers.google.com/search/docs/crawling-indexing/robots/intro), [lab/field Web Vitals](https://web.dev/articles/vitals).

## Files changed relative to main

```text
docs/seo/inside914-local-seo-and-backlinks.md
docs/seo/phase8-lighthouse-summary.json
docs/seo/phase8-verification.md
e2e/home.spec.ts
e2e/seo.spec.ts
e2e/square-campaign.spec.ts
next.config.ts
package.json
scripts/audit-public-seo.mjs
src/app/areas/central-westchester/page.tsx
src/app/areas/eastern-westchester/page.tsx
src/app/areas/northern-westchester/page.tsx
src/app/areas/page.tsx
src/app/areas/southern-westchester/page.tsx
src/app/book/cart/details/page.tsx
src/app/book/layout.tsx
src/app/layout.tsx
src/app/legal/[doc]/page.tsx
src/app/not-found.tsx
src/app/opengraph-image.tsx
src/app/page.tsx
src/app/robots.ts
src/app/sitemap.ts
src/assets/fonts/Fraunces-600.ttf
src/assets/fonts/Fraunces-OFL.txt
src/assets/fonts/Geist-500.ttf
src/assets/fonts/Geist-OFL.txt
src/assets/fonts/README.md
src/components/header-cta.tsx
src/components/marketing/area-landing-page.tsx
src/components/marketing/postcard-illustration.tsx
src/components/site-footer.tsx
src/components/site-header.tsx
src/lib/security/headers.ts
src/lib/seo-regions.ts
src/lib/seo.ts
tests/booking-layout-release.test.tsx
tests/security-headers.test.ts
tests/seo-foundation.test.ts
vercel.json
```
