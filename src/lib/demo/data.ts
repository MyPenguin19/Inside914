// DESIGN-PREVIEW sample data. Not real inventory, advertisers or campaigns; never written anywhere.
import type { CatalogSlot, SlotPair } from "@/lib/booking/selection";
import type { EditionCatalog } from "@/lib/catalog/queries";
import type { PostcardZone } from "@/components/postcard/postcard-side";

// PROVISIONAL sample layout (not the approved print layout): a masthead across the top of the
// front, a mailing panel (address + postage) across the bottom of the back, ad spaces in between.
const CARD = { width: 6.5, height: 12 };
const MASTHEAD = 1.4;
const MAILING = 3.3;
const RESERVED_SAMPLE = new Set(["F2", "B5", "B6"]);
const round = (n: number) => Math.round(n * 1000) / 1000;

function grid(side: "front" | "back", top: number, height: number, rows: number): CatalogSlot[] {
  const unitHeight = round(height / rows);
  const unitWidth = CARD.width / 2;
  return Array.from({ length: rows * 2 }, (_, i) => {
    const label = `${side === "front" ? "F" : "B"}${i + 1}`;
    return {
      id: `demo-${label}`,
      side,
      label,
      x: (i % 2) * unitWidth,
      y: round(top + Math.floor(i / 2) * unitHeight),
      width: unitWidth,
      height: unitHeight,
      available: !RESERVED_SAMPLE.has(label),
    };
  });
}

const slots: CatalogSlot[] = [...grid("front", MASTHEAD, CARD.height - MASTHEAD, 4), ...grid("back", 0, CARD.height - MAILING, 3)];

export const DEMO_ZONES: PostcardZone[] = [
  { side: "front", kind: "masthead", x: 0, y: 0, width: CARD.width, height: MASTHEAD, title: "Local businesses near you", detail: "Central Westchester · January 2027" },
  { side: "back", kind: "mailing", x: 0, y: CARD.height - MAILING, width: CARD.width, height: MAILING, title: "Address area", detail: "Mailing panel (provisional)" },
];

// Same rule as the database's slot_pairs view: same side and row, right unit starts where left ends.
const pairs: SlotPair[] = slots.flatMap((l) =>
  slots
    .filter((r) => r.side === l.side && r.y === l.y && r.height === l.height && r.width === l.width && r.x === l.x + l.width)
    .map((r) => ({ leftId: l.id, rightId: r.id, side: l.side, available: l.available && r.available })),
);

export const DEMO_EDITION: EditionCatalog = {
  id: "demo-central-westchester",
  zoneSlug: "demo-central-westchester",
  zoneName: "Central Westchester",
  households: 5000,
  issueMonth: "2027-01-01",
  artworkDeadline: "2026-12-16T04:59:59Z",
  mailDate: null, // sample data: no mail date shown
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
