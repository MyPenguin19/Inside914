import type { PUBLIC_INDEXABLE_PATHS } from "./seo";

// Editorial dates, never the build or request clock. The 2026-11-13 release adds
// the owner-supplied Organization address to every public page's structured data.
// Update only affected entries when their content, links or schema materially change.
export const PUBLIC_PAGE_LAST_MODIFIED = {
  "/": "2026-11-13",
  "/how-it-works": "2026-11-13",
  "/areas": "2026-11-13",
  "/areas/central-westchester": "2026-11-13",
  "/areas/southern-westchester": "2026-11-13",
  "/areas/northern-westchester": "2026-11-13",
  "/areas/eastern-westchester": "2026-11-13",
  "/pricing": "2026-11-13",
  "/our-postcard": "2026-11-13",
  "/faq": "2026-11-13",
  "/contact": "2026-11-13",
  "/about": "2026-11-13",
  "/legal/terms": "2026-11-13",
  "/legal/reservation-policy": "2026-11-13",
  "/legal/payment-authorization": "2026-11-13",
  "/legal/cancellation-policy": "2026-11-13",
  "/legal/privacy": "2026-11-13",
} satisfies Record<(typeof PUBLIC_INDEXABLE_PATHS)[number], string>;
