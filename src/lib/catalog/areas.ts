import type { AreaCard } from "@/components/booking/area-cards";
import type { EditionSummary } from "@/lib/catalog/queries";
import { formatIssueMonth } from "@/lib/format";

// The campaign details in the database (dates, household count, layout) are PLACEHOLDERS
// seeded in Task 2, not confirmed facts. While true, live pages say so. Set to false only once
// real campaign values are configured.
export const CAMPAIGN_DETAILS_PROVISIONAL = true;

// Areas Inside914 plans to serve that have no campaign configured yet. Shown as "coming soon"
// unless a bookable edition exists for the same zone slug. No dates, counts or towns: none exist.
export const PLANNED_AREAS: { slug: string; name: string }[] = [{ slug: "northern-westchester", name: "Northern Westchester" }];

// Cards for the live areas page: one per bookable edition (from Supabase), then planned areas.
export function areaCardsFrom(editions: EditionSummary[], planned = PLANNED_AREAS): AreaCard[] {
  const live: AreaCard[] = editions.map((e) =>
    e.availableUnits > 0
      ? {
          status: "available",
          name: e.zoneName,
          edition: `${formatIssueMonth(e.issueMonth)} edition`,
          households: e.households,
          openSpaces: e.availableUnits,
          totalSpaces: e.totalUnits,
          unitPriceCents: e.unitPriceCents,
          doublePriceCents: e.doublePriceCents,
          reserveBy: e.artworkDeadline,
          mailDate: e.mailDate,
          href: `/editions/${e.id}`,
        }
      : { status: "full", name: e.zoneName, edition: `${formatIssueMonth(e.issueMonth)} edition` },
  );
  const liveSlugs = new Set(editions.map((e) => e.zoneSlug));
  const soon: AreaCard[] = planned
    .filter((a) => !liveSlugs.has(a.slug))
    .map((a) => ({ status: "soon", name: a.name, edition: "Coming soon" }));
  return [...live, ...soon];
}
