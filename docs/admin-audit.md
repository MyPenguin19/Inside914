# Inside914 admin workflow and performance audit

Audited November 3, 2026. Verification below was completed locally before release.

The admin now keeps the owner focused on one campaign and its next task. This audit checked navigation, campaign setup, advertiser management, artwork review, payment visibility, print preparation, error feedback, and desktop/mobile layouts. It found unnecessary background work and several places where the interface could cause confusion or repeat work; those were corrected without removing existing operations.

## Findings and fixes

| Finding | Change | Benefit for the owner |
| --- | --- | --- |
| Ordinary campaign tabs fetched and processed the permanent house image and ran print/payment checks they did not display. | Fetch that information only on Artwork or Print & mail, as needed. | Opening everyday campaign tabs does less work. |
| Print & mail repeated readiness checks, ledger reads and house-image loading. | Share the results within the same server render. All saving/charging actions still run their own fresh checks. | Removes duplicate requests without retaining stale approval information between visits. |
| Some independent reads waited for one another; detail pages loaded every campaign to find one. | Run independent reads together and fetch campaign details directly by ID. | Shorter request chains and less unnecessary data. Archived campaign details retain their campaign context. |
| A confirmation form could close before its save finished. | Keep it visibly busy until completion; prevent another submission; preserve typed reasons and confirmation text when a save is refused. | Clear feedback and less retyping or uncertainty about whether to click again. |
| Reviewing consecutive ads required returning to a list. | Add a direct next-ad link within the same campaign, a scoped return to its review queue, and an advertiser email link. | Faster review without accidentally approving the next ad. |
| Payment totals did not follow the selected campaign consistently. | Scope the totals, card counts and charge records to the campaign, and explicitly label the scope. | The summary matches the records being viewed. |
| Finished work cluttered the current campaign list. | Add a Finished filter; keep Archived separate. | Current work is easier to find while history stays available. |
| Clearing a text search also removed the selected campaign. | Clear only the search words, preserving the campaign and status. | The owner stays in the same workspace. |
| Waiting or failed routes lacked enough guidance. | Add a readable loading state and a retry screen. Stream optional backup downloads and printer records separately where practical. | Clearer progress and a way to recover. |
| Printer proof wording could imply approval before review; payment checks could appear successful while collection was disabled. | Distinguish a final proof from an approved/shared proof, and show payment success only when collection is configured too. | Status labels match what can actually happen next. |

## The everyday workflow

1. **Home:** see current campaigns and grouped items needing attention.
2. **New campaign:** choose the area, set dates, then set the price. Save a draft and open it when ready.
3. **Campaign → Advertisers & spaces:** invite businesses and manage individual spaces when needed.
4. **Campaign → Artwork:** inspect each ad, approve it or request changes, then move directly to the next ad.
5. **Campaign → Print & mail:** preview/download the postcard, upload and approve the printer's proof, review payment readiness, record printer updates, then record the mailing.
6. **Finished / Archived:** find previous work without mixing it with active campaigns.

Optional fields and uncommon operations remain available in expandable sections. Campaign tabs, search, status filters, browser Back and refresh preserve the current workspace. The full operation-to-location map is in [admin-workspace.md](admin-workspace.md).

## Mobile and loading follow-up

The owner's November 3 screenshots exposed two gaps in the original audit: the horizontal phone navigation clipped destinations, and heading-only timings missed the streamed data wait. The earlier ~0.34-second measurements are superseded by the populated-page measurements below.

- Phones now have a 69px sticky header and a vertical Menu disclosure with all seven destinations and Sign out. Touch targets are at least 44px. Escape returns focus to the toggle; navigation, outside taps and leaving the menu close it.
- Narrow records use readable cards, long names wrap, and payment summaries stack. Desktop keeps its sidebar and tables.
- Remote user verification and the RLS admin membership query run concurrently. The cookie supplies only a credential; access still requires a verified user and a matching current admin row. The SDK's explicit-JWT [getUser](https://supabase.com/docs/reference/javascript/auth-getuser) call avoids holding the session lock during the remote check; [getSession](https://supabase.com/docs/reference/javascript/auth-getsession) is never treated as proof of identity.
- Campaign counts, slots and bookings arrive in one joined query, scoped to the requested status before loading children. Home shares this request between campaign cards and attention items.
- Paginated advertiser/artwork rows include their position labels. Advertisers with multi-area carts still make a scoped extra read for the other selected areas.
- Payment records, campaign choices, totals and ledger reads start together. Consent and campaign-readiness reads run only for a selected campaign, where they are displayed.
- Private data is not cached across requests or users. No migration, environment change, payment change or deployment is part of this follow-up.

## Measured loading performance

Both versions used local production builds, the same isolated local database, and synthetic reservations. The baseline was an isolated source copy of deployed commit `e555247`. Each local Auth/PostgREST request was delayed by **150ms in the test process only** to expose sequential network waits. This is a controlled simulation, not measured production network latency.

The benchmark measures a real sidebar click through visible populated rows, totals and completed loading states. Home waits for both current campaigns and attention items. It checks readiness every animation frame; coarse assertion polling is excluded from the timing. One initial circuit is recorded separately, followed by three repeated circuits whose medians are below.

| Screen | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Campaigns | 692 ms | 373 ms | 46% |
| Advertisers | 691 ms | 361 ms | 48% |
| Artwork | 673 ms | 362 ms | 46% |
| Payments | 980 ms | 375 ms | 62% |
| Home | 838 ms | 658 ms | 21% |

These results show reduced waiting with upstream latency. They do not establish live Vercel, cold-start, large-account or multi-area-cart timings. Live authenticated timing remains to be verified after deployment; the connected browser could not attach to the signed-in tab during this session.

Raw reports: `outputs/inside914-admin-audit/data-before-150.json` and `data-after-150.json` in the workspace. The repeatable command is:

```sh
INSIDE914_E2E_PRODUCTION=true INSIDE914_AUDIT_UPSTREAM_DELAY_MS=150 \
  node scripts/verify-local-mvp.mjs test:e2e -- e2e/admin-performance.spec.ts
```

Set `INSIDE914_LOCAL_STACK_ID` when more than one local native stack exists. The latency preload refuses non-local databases and Vercel; it is never imported by application code.

## Follow-up verification

- Production build, TypeScript, lint and whitespace checks pass.
- 600 unit tests and 22 local database integration tests pass, including cookie-identity rejection, verification failure, mismatched membership and immediately revoked admin membership.
- 10 distinct production-mode browser tests pass across admin access, mobile navigation, workspace operations, consecutive artwork review and loaded-data performance.
- Mobile checks exercise every destination at 320, 375, 430 and 768px, Escape/focus behavior, sticky-menu access after scrolling, populated records and horizontal overflow. Existing page checks additionally cover 390 and 1440px.
- Desktop sidebar/current-page state, filters, selected campaign totals, Back/refresh, proof upload and review persistence remain verified. Synthetic artwork state is unchanged by read-only navigation.
- Screenshots: `mobile-menu.png`, `mobile-campaigns.png`, `mobile-payments.png`, `mobile-review-artwork.png`, and `desktop-campaigns.png` under the same output folder.

## Original audit verification

- Production build, TypeScript checks, lint and whitespace checks pass.
- 598 unit tests passed; the final search and confirmation tests were also rerun after the last change.
- 21 admin database integration tests passed against real local Auth, row-level security and database functions.
- 19 distinct browser tests passed across the admin, operations, workspace, campaign management, square campaign, original download, consecutive review and performance suites. The final review and workspace runs used the production build.
- Browser checks exercised campaign creation/editing, opening/cancellation, pricing, layout upgrades, archiving/deletion, original image downloads and ZIP files, print exports, protected pages, combined filters, private proof uploads and mobile navigation.
- The consecutive-review test verified actual saved approval/change-request records, preserved campaign totals, an empty review queue after both ads were handled, and campaign context after archiving.
- Database readiness checks continued to refuse an incomplete campaign being marked mailed. The test fixture was corrected to use a cancelled campaign for Finished/Archived coverage; the guard was retained.

No new dependencies or admin database migration were needed. Authorization, financial confirmations, print geometry and database readiness rules remain in place. The audit used no production records, actual charges, or customer email sends. Large print exports and original-file downloads remain deliberate actions rather than work performed whenever a campaign is opened.

The earlier customer ad-space changes in this working tree have a separate migration, documented in [ad-space-changes.md](ad-space-changes.md).
