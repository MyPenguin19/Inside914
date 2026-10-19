// Canonical area names only. Geographic boundaries, routes and quantities are not confirmed.
// Keep this module free of server/client dependencies: admin, catalog and local tooling share it.
export const REGIONS = [
  { slug: "central-westchester", name: "Central Westchester" },
  { slug: "southern-westchester", name: "Southern Westchester" },
  { slug: "northern-westchester", name: "Northern Westchester" },
  { slug: "eastern-westchester", name: "Eastern Westchester" },
] as const;

export const findRegion = (slug: string) => REGIONS.find((area) => area.slug === slug) ?? null;

// Area selection never invents dates, a mailing month or a confirmed delivery quantity.
export function regionalDraftDefaults(zone: { name: string; household_count: number }) {
  return {
    name: zone.name,
    target_quantity: zone.household_count > 0 ? String(zone.household_count) : "",
  };
}
