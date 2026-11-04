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

## Measured loading performance

Measurements used a local production build, the isolated local Supabase stack, synthetic confirmed advertisers, and actual image files. Each screen was warmed up, then measured over three full-page navigations. The values below are medians, including navigation and the screen's main heading becoming visible. They are not cold-start, large-account, or live Vercel measurements, and do not measure completion of every optional streamed panel.

| Screen | Before | After |
| --- | ---: | ---: |
| Home | 349 ms | 345 ms |
| Campaign list | 342 ms | 346 ms |
| Campaign overview | 338 ms | 342 ms |
| Campaign advertisers & spaces | 356 ms | 348 ms |
| Campaign artwork | 383 ms | 351 ms |
| Campaign print & mail | 331 ms | 342 ms |
| Campaign settings | 333 ms | 343 ms |
| New campaign | 343 ms | 335 ms |
| Advertiser list | 333 ms | 336 ms |
| Review queue | 331 ms | 339 ms |
| Payments | 339 ms | 340 ms |
| Advertising areas | 333 ms | 341 ms |
| Global settings | 336 ms | 339 ms |

All measured screens were approximately **0.34 seconds locally**. Most differences are small enough to be normal measurement variation; these results do not establish a large speedup. The verified performance improvements are fewer unnecessary reads, image processing only where required, and fewer sequential dependencies. Remote-network benefits still need measurement after deployment. The later search-preservation change only changes link parameters and was verified separately in the production build.

The performance check observed no browser runtime errors or horizontal overflow across these 13 screens at 375 and 1440 px. Campaign workspace checks also covered 320 px. Screenshots and raw measurements are saved in the workspace's `outputs/inside914-admin-audit` folder.

## Verification

- Production build, TypeScript checks, lint and whitespace checks pass.
- 598 unit tests passed; the final search and confirmation tests were also rerun after the last change.
- 21 admin database integration tests passed against real local Auth, row-level security and database functions.
- 19 distinct browser tests passed across the admin, operations, workspace, campaign management, square campaign, original download, consecutive review and performance suites. The final review and workspace runs used the production build.
- Browser checks exercised campaign creation/editing, opening/cancellation, pricing, layout upgrades, archiving/deletion, original image downloads and ZIP files, print exports, protected pages, combined filters, private proof uploads and mobile navigation.
- The consecutive-review test verified actual saved approval/change-request records, preserved campaign totals, an empty review queue after both ads were handled, and campaign context after archiving.
- Database readiness checks continued to refuse an incomplete campaign being marked mailed. The test fixture was corrected to use a cancelled campaign for Finished/Archived coverage; the guard was retained.

No new dependencies or admin database migration were needed. Authorization, financial confirmations, print geometry and database readiness rules remain in place. The audit used no production records, actual charges, or customer email sends. Large print exports and original-file downloads remain deliberate actions rather than work performed whenever a campaign is opened.

The earlier customer ad-space changes in this working tree have a separate migration, documented in [ad-space-changes.md](ad-space-changes.md).
