# Owner workflow

The admin is organized around one campaign at a time. All existing operations remain available; this change adds no database migration and does not change authorization, collection rules, campaign transitions or print geometry.

On phones, use **Menu** in the compact sticky header to reach any admin section or sign out. The menu opens vertically, closes after navigation, and supports Escape. Narrow lists display cards with wrapping names and contact details. Desktop retains the sidebar and tables.

## Where to go

| Job | Location |
| --- | --- |
| See what needs attention | Home: current work and grouped recent alerts |
| Start a mailing | New campaign: area, schedule, then price; saved as a draft |
| Open, pause, resume or close reservations | Campaign → Overview |
| Extend an expired deadline or cancel | Campaign → Overview, when the existing eligibility rules allow it |
| Invite a business | Campaign → Advertisers & spaces → Invite a business |
| Block/unblock a space or release an expired hold | Campaign → Advertisers & spaces → Manage individual spaces |
| Review an ad or request changes | Campaign → Artwork → Review artwork; use Next ad awaiting review to continue |
| Download original files, including retained versions | Campaign → Artwork, or the individual advertiser/artwork page |
| Preview/download the postcard | Campaign → Print & mail |
| Upload and approve the printer's proof | Campaign → Print & mail → Printer proof & records |
| Record printer milestones | Campaign → Print & mail → Record printer updates |
| Review payment amounts, collection and recovery | Campaign → Print & mail → Payments for this campaign |
| Record a completed mailing | Campaign → Print & mail → Record the mailing |
| Edit campaign details | Edit at the top of the campaign |
| Archive/delete/upgrade a layout | Campaign → Campaign settings → Archive, delete or change layout |
| Find completed or cancelled work | Campaigns → Finished; archived campaigns remain under Archived |
| Contact an advertiser, add notes, review requests or email delivery | Advertisers → business name |
| Cancel a reservation or flag a problem | Advertiser → Manage reservation or flag a problem |
| Reuse or edit an advertising area | Advertising areas |
| Replace the permanent house advertisement or inspect configuration | Settings |

Older layouts retain their existing production page, linked from Print & mail. The January proposal remains under Advertising areas → Saved campaign proposal.

Campaign sections use a `view` URL parameter, so refresh, browser Back and direct links preserve the current workspace. Unknown sections fall back to Overview. Artwork, advertiser and payment lists keep campaign, status and search together. Clear search removes only the search words. “All” now explicitly sends `filter=all`; the payment table and totals are scoped to the chosen campaign.

Optional proof quantities/date/notes and printer updates remain available on demand. Uploading a proof does not approve or publish it. Financial and destructive actions retain their original explicit confirmation and server/database checks.

## Verification

- Local browser coverage for campaign create/edit/open/cancel, pricing, layout upgrade, archive/delete, artwork originals/ZIP, print exports and protected routes.
- Workspace coverage at 320, 375 and 1440 px, with Back/refresh, combined filters, empty results in another campaign, and private proof uploads including optional fields.
- Unit coverage for next-step guidance and query preservation.
- Uses the isolated local Supabase stack and synthetic fixtures. No production data, Stripe account or customer email is used.

This admin change requires no migration. The accompanying ad-space change has its own migration requirement documented in `ad-space-changes.md`.
