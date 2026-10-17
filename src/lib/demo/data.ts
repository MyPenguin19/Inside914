// DESIGN-PREVIEW sample data. Not real inventory, advertisers or campaigns; never written anywhere.
import type { CatalogSlot, SlotPair } from "@/lib/booking/selection";
import type { EditionCatalog } from "@/lib/catalog/queries";

// Provisional 2 x 4 grid per side, matching the dev seed's geometry (not the approved print layout).
const RESERVED_SAMPLE = new Set(["F2", "B5", "B6"]);

const slots: CatalogSlot[] = (["front", "back"] as const).flatMap((side) =>
  Array.from({ length: 8 }, (_, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const label = `${side === "front" ? "F" : "B"}${i + 1}`;
    return { id: `demo-${label}`, side, label, x: col * 3.25, y: row * 3, width: 3.25, height: 3, available: !RESERVED_SAMPLE.has(label) };
  }),
);

// Same rule as the database's slot_pairs view: same side and row, right unit starts where left ends.
const pairs: SlotPair[] = slots.flatMap((l) =>
  slots
    .filter((r) => r.side === l.side && r.y === l.y && r.height === l.height && r.width === l.width && r.x === l.x + l.width)
    .map((r) => ({ leftId: l.id, rightId: r.id, side: l.side, available: l.available && r.available })),
);

export const DEMO_EDITION: EditionCatalog = {
  id: "demo-central-westchester",
  zoneName: "Central Westchester",
  households: 5000,
  issueMonth: "2027-01-01",
  artworkDeadline: "2026-12-16T04:59:59Z",
  unitPriceCents: 50000,
  doublePriceCents: 90000,
  bookable: true,
  totalUnits: slots.length,
  availableUnits: slots.filter((s) => s.available).length,
  slots,
  pairs,
};

export const DEMO_AREAS = [
  {
    name: "Central Westchester",
    status: "available" as const,
    edition: "January 2027 edition",
    households: 5000,
    towns: "Illustrative example: neighborhoods around White Plains, Hartsdale and Scarsdale.",
  },
  {
    name: "Northern Westchester",
    status: "soon" as const,
    edition: "Coming soon",
    households: null,
    towns: "Illustrative example: neighborhoods around Mount Kisco, Bedford and Chappaqua.",
  },
];

export const DEMO_REFERENCE = "DEMO-PREVIEW";

// Sample advertisers for the admin preview: generic, clearly fictional names.
export const DEMO_ADVERTISERS = [
  { business: "Sample Bakery", contact: "Sample contact A", position: "F2", size: "Standard", amount: 50000, artwork: "Approved", payment: "Card saved" },
  { business: "Sample Home Services", contact: "Sample contact B", position: "B5 + B6", size: "Double", amount: 90000, artwork: "Needs review", payment: "Card saved" },
];
