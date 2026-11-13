# Public content signals and agent discovery — November 13, 2026

## Released behavior

- `https://inside914.com/robots.txt` declares `Content-Signal: search=yes, ai-train=no` within the wildcard user-agent group. Existing public crawling and private API/token exclusions remain intact. Preview deployments still disallow crawling.
- The sitemap contains 17 canonical public URLs, including About and all five published policies. Every entry has an editorial `lastmod` of `2026-11-13`, reflecting this release's shared Organization schema update. Dates are explicit in `src/lib/content-dates.ts`; requests and redeployments cannot advance them automatically.
- Organization schema includes the owner's address: **N State RD, Briarcliff Manor, NY 10510, US**. The same address is visible on Contact and About. No street number, storefront hours, coordinates or third-party profiles were invented.
- `/about` uses the existing marketing layout and has its own title, description, canonical URL, AboutPage schema and breadcrumbs. The shared footer links it from the homepage and other public pages.
- `/llms.txt` serves a concise public guide with working links to marketing, regional and legal pages.
- The homepage serves `text/markdown; charset=utf-8` for explicit, preferred Markdown GET/HEAD requests. `/index.md` offers the same representation directly, discovered through the homepage's alternate link. Ordinary browser requests retain HTML. The Markdown response is private/non-cacheable and varies on Accept; quality preferences and Markdown refusal (`q=0`) are respected.
- Public Markdown handling runs before administrator authentication, only at `/`. Private routes retain their existing authorization and indexing behavior. React client navigation and POST requests continue normally.

## External profiles

The owner replied with `https://inside914.com/` when asked for official social/directory profiles. This is already the Organization's `url`. It was not duplicated into `sameAs`, and no external profiles were guessed. Verified external profile URLs are still needed to resolve that audit item.

## Verification

- Type checking and ESLint passed.
- All **649 unit tests** passed across 83 files.
- Local production build passed against the isolated local Supabase environment; no production fixtures or provider writes.
- **58 Playwright tests** passed using the built site: the 17-page SEO crawler, desktop/mobile automated accessibility checks, keyboard navigation, enlarged text, policy links, content negotiation, HEAD, and administrator authentication.
- About screenshots reviewed at 390px and 1440px. Existing visual tokens, layout components, typography and header navigation were retained.
- Deployment manifest checked: environment files, credential/config directories, local build caches, dependencies and test artifacts excluded.
- Protected deployment checks passed for robots.txt, sitemap, llms.txt, index.md, About, Contact and HTML → Markdown → HTML response switching before domain promotion.
- Final read-only audit on `https://inside914.com` passed for **17 public pages and 759 link/asset references**. It verifies titles, descriptions, canonical and social metadata, schema references/address, sitemap dates, robots directives, guide links and Markdown negotiation. No production forms were submitted.
- Automated accessibility checks are scoped test results, not a legal certification. No new Is Agentic score is claimed: its report API returned `report_not_found` before this release.

## Deployment

- Application commit: `906bda2` — Add public content signals and agent-friendly discovery.
- Project/scope: `inside914` / `mypenguin19s-projects`.
- Deployment: `dpl_5pqNXTxnrJQksHPrJvTtXyDuTvoZ`.
- Deployment URL: `https://inside914-ff9b8o20n-mypenguin19s-projects.vercel.app`.
- Production alias verified: `https://inside914.com` points to that Ready deployment.
- Previous production deployment retained for rollback: `dpl_9ELdUnJR49uqrcbipaxhvxzbsCD3`, `https://inside914-61i4fjwo7-mypenguin19s-projects.vercel.app`.
- Deployed with `--prod --skip-domain`; promoted only after read-only staged checks. Git automatic deployments remain disabled for main.
- No database migrations, payment configuration changes, live charges or outbound messages.

## Maintenance references

- [Google sitemap lastmod guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap): dates represent significant content, schema or link changes.
- [Cloudflare content-signal documentation](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/): supported content-use declarations and their scope.
- [llms.txt proposal](https://llmstxt.org/): concise site guide, public links and alternate representation discovery.
- [Vercel content negotiation guidance](https://vercel.com/blog/making-agent-friendly-pages-with-content-negotiation): requesting Markdown through the Accept header.
- Installed Next.js 16.4.2 documentation: robots rule `other` emits custom directives; Proxy supports an early direct response.
