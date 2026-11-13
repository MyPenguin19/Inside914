# Public pages, policies and accessibility — November 12, 2026

## Delivered

- Added `/legal/payment-authorization` and `/legal/cancellation-policy`, linked from the Policies footer and related-policy navigation. Each has its own title, description and canonical URL. Existing policy pages retain `noindex, follow`.
- Used the supplied screenshots as topic references. The new pages explain the existing November 2 agreement; its archived text, checkout consent, accepted amounts and historical versions are unchanged. The new summaries retain the existing refund rights and use the actual support address, `Info@inside914.com`. Draft-review banners, internal deployment switches and promises unsupported by the current product were not copied from the mockups.
- Removed the visible homepage “Interactive sample card” heading while retaining the card's accessible name and front/back controls.
- Unified public-page spacing, headings, responsive pricing cards, section dividers, footer links and policy reading widths. Added keyboard-operable contents navigation to policies and the FAQ page.
- Added skip navigation across the public header layouts, visible focus indicators, active-page navigation, an Escape-dismissable mobile menu and larger navigation/button targets. Mobile headers and the area-selection summary no longer cover page content as sticky overlays.
- Improved form-control borders, required-field instructions, error associations, focused contact-form feedback and links from errors to their fields.
- Corrected SVG map and ad-position accessible names, crop-editor semantics and duplicate reservation landmarks. Added bounded arrow buttons for moving artwork without dragging, alongside the existing keyboard controls and zoom slider.
- Removed button color interpolation that briefly produced insufficient contrast between enabled, disabled and hover states. Reduced-motion and forced-color focus styles are preserved.

## Verification

- `typecheck`, `lint`, production build: passed.
- Unit suite: **608 tests passed** across 77 files.
- Production-build browser suite: **65 tests passed** across accessibility, SEO, homepage and policy specs.
- Local development browser checks: **2 tests passed**, covering contact validation/local email recording and the complete multi-area reservation journey using fake payment IDs. No live payment or email provider was called.
- Axe 4.14 scans, with WCAG 2 A/AA, 2.1 A/AA, 2.2 AA and best-practice tags, found **zero violations** across all 16 public/policy routes at 390 and 1440 pixels. No rules or page regions were excluded.
- Additional axe scans covered selected areas, position selection, held areas/timer, crop and fitted-image editors, invalid business details, mobile/desktop payment consent, confirmation, private reservation and recovery.
- Browser interaction checks covered skip-link focus, native policy contents links, mobile-menu Escape/focus behavior, current-page indication, expanded FAQs, both postcard faces, form-error navigation, zoom, keyboard crop movement and arrow-button movement.
- Reflow checks covered 320-pixel layouts with WCAG text spacing and policy content at 200% text size. Existing metadata, canonical, JSON-LD, sitemap and private-page indexing checks passed.
- Desktop/mobile screenshots were reviewed. Browser and screenshot artifacts are local and excluded from deployment.

## Scope and limits

This work targets WCAG 2.2 AA and removes the issues found in the checked states. Automated scans and scripted keyboard checks do not establish legal ADA compliance or certify complete WCAG conformance. A manual assistive-technology review is still needed, including VoiceOver/NVDA, meaningful reading order, all recovery/error states, the essential inventory-hold time limit, and the real Stripe-hosted payment interface. Payment testing here used the isolated local simulation; the live checkout was not submitted.

Reference guidance: [DOJ web accessibility guidance](https://www.ada.gov/resources/web-guidance/), [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/), and [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing).

## Release

Merge to `main`, push to `MyPenguin19/Inside914`, and stage a production build on Vercel project `inside914` in `mypenguin19s-projects`. Verify the staged HTML before promotion, then run GET-only SEO and public accessibility checks on `inside914.com`. The existing `main` automatic-deployment safeguard remains enabled (automatic deployments disabled).

Rollback deployment before this release: `dpl_AW8uZTj64p61hNaaKKCDbWT5v5JV`.
