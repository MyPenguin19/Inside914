# Public policy indexing — November 13, 2026

The owner requested that the five current public policy pages become indexable and appear in the sitemap. The sitemap now contains 16 canonical URLs: the existing 11 marketing pages plus advertising terms, reservation policy, payment authorization, cancellation and refunds, and privacy policy.

The policy route inherits the root layout's indexing rules: production pages allow indexing and previews remain noindex. Unknown policy routes remain noindex/404. Public policy URLs also redirect from the legacy hosting alias to the canonical domain. The marketing-only registry remains separate so analytics coverage is unchanged.

Each policy retains its individual title and description and now shares the canonical Open Graph/Twitter metadata and WebPage, BreadcrumbList, Organization and WebSite structured data used by the public site. Policy wording, accepted consent versions, styles and layouts are unchanged. Private admin, account, checkout, reservation and payment routes remain excluded from the sitemap and retain their indexing protections.

Validation before release:

- Type checking and lint passed.
- All 627 unit tests passed, including policy source/consent preservation checks.
- Production build passed. The first sandboxed build was prevented from binding a compiler port; a fresh generated cache and the required local access resolved it.
- All 11 targeted browser checks passed against the local production build: policy pages and footer links, mobile/desktop content, 16-page server HTML/schema/sitemap crawl, canonical-host redirects, and private-page indexing boundaries.

Google determines whether and when eligible pages are indexed. This change allows discovery and indexing; it does not assert that Google has already indexed the pages.
