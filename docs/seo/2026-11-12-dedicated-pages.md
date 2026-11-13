# Dedicated marketing pages and SEO verification

Date: November 12, 2026. Canonical host: https://inside914.com.

## Public pages

Every main-menu entry now has a dedicated URL, useful server-rendered content, a unique title and description, canonical URL, Open Graph/Twitter metadata and a visible breadcrumb.

| Menu | URL | Page schema |
| --- | --- | --- |
| How It Works | /how-it-works | WebPage |
| Advertising Areas | /areas | CollectionPage + ItemList |
| Pricing | /pricing | WebPage + Service + Offer |
| Our Postcard | /our-postcard | WebPage |
| FAQ | /faq | FAQPage + Question/Answer |
| Contact | /contact | ContactPage |

The homepage, these six pages and the four existing regional guides make 11 public sitemap entries. All public pages include consistent Organization and WebSite entities. Non-home pages include BreadcrumbList. Contact details match the published footer. The organization logo is served as a 600 × 240 PNG at /brand-logo, using the existing wordmark fonts.

The advertised $399 figure is shared by the homepage, pricing page and Service offer. Actual reservation prices continue to come from campaign pricing; the marketing update does not change existing agreements or billing behavior. No availability, review ratings, business address or delivery quantities were invented.

Desktop and mobile menus, homepage links, related-page links and footer links make the pages discoverable through ordinary HTML links. Existing homepage fragments remain available. Public URLs on the old inside914.vercel.app alias permanently redirect to the matching inside914.com path, retaining query parameters. Private authentication/reservation routes and preview hosts retain their existing behavior.

## Validation

- Typecheck, lint and production build pass.
- 608 unit tests pass using the isolated local verification wrapper.
- 18 final SEO browser checks pass: server HTML crawl, host redirects, all 11 public pages, mobile navigation, keyboard access, enlarged text, private noindex boundaries and interactive sample/FAQ behavior. The three homepage tests also passed during this implementation.
- Browser layout checks cover widths 320, 375, 390, 768, 1024 and 1440, plus 200% text at 390. Screenshots reviewed for desktop pricing and mobile How It Works.
- The GET-only crawler validates unique metadata, HTTP status, canonical/social URL consistency, heading order, internal links and fragments, robots directives, sitemap contents, structured-data references, exact FAQ text parity, visible offer price and both PNG dimensions.
- Existing preview noindex, private route noindex and policy noindex remain in place. Policy pages now have their own descriptions. Public Analytics coverage follows the expanded public-page registry; Contact and private flows remain excluded.
- The old crawler assertion that reservations must be closed was removed. This was stale after the approved reservation release; private-page indexing checks remain.

Reproduce with the existing local stack and `scripts/verify-local-mvp.mjs`. Use `INSIDE914_E2E_PRODUCTION=true` for the browser suite after a local build. The standalone live audit is read-only: `npm run test:seo -- https://inside914.com --production`. Never run the database-backed browser suite against production.

## Google interpretation and remaining external checks

These checks validate what the site serves, not Google's decision to index or rank it. The connected Search Console tab displayed a blank report even after refresh, so property indexing counts, sitemap submission status, manual actions and field Core Web Vitals could not be verified in this session. No Search Console submissions or settings were changed.

After release, review the existing Inside914 property’s Pages and Sitemaps reports, inspect a new URL and request indexing if needed. The sitemap URL remains https://inside914.com/sitemap.xml. Google must recrawl the updated site. No ranking or rich-result display is guaranteed.

FAQPage remains valid Schema.org vocabulary for the visible questions and answers. Google retired FAQ rich results in May 2026 and removed that feature’s documentation in June; no FAQ rich-result benefit is claimed. Service/Offer describes the actual advertised service and is not a claim of Product shopping-result eligibility. Organization is used instead of inventing a LocalBusiness street address. Sitemap timestamps are omitted rather than synthesized on every request.

Official references checked:

- [Google title links](https://developers.google.com/search/docs/appearance/title-link)
- [Google meta descriptions](https://developers.google.com/search/docs/appearance/snippet)
- [Google structured-data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Organization requirements](https://developers.google.com/search/docs/appearance/structured-data/organization)
- [Breadcrumb requirements](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
- [Google Search documentation updates, including FAQ retirement](https://developers.google.com/search/updates)
- [Canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)
- [Schema.org Service](https://schema.org/Service) and [FAQPage](https://schema.org/FAQPage)

No database migrations, production data writes, payment operations, email sending or new dependencies are part of this change.
