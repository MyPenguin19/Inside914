import type { CatalogSlot, SlotPair } from "@/lib/booking/selection";
import type { EditionCatalog } from "@/lib/catalog/queries";

// A 2-column provisional grid: one row per side is enough to exercise every rule.
export const slots: CatalogSlot[] = [
  { id: "f1", side: "front", label: "F1", x: 0, y: 0, width: 3.25, height: 3, available: true },
  { id: "f2", side: "front", label: "F2", x: 3.25, y: 0, width: 3.25, height: 3, available: true },
  { id: "f3", side: "front", label: "F3", x: 0, y: 3, width: 3.25, height: 3, available: true },
  { id: "f4", side: "front", label: "F4", x: 3.25, y: 3, width: 3.25, height: 3, available: false },
  { id: "b1", side: "back", label: "B1", x: 0, y: 0, width: 3.25, height: 3, available: false },
  { id: "b2", side: "back", label: "B2", x: 3.25, y: 0, width: 3.25, height: 3, available: false },
];

// As public.slot_pairs would return them: availability = both units free.
export const pairs: SlotPair[] = [
  { leftId: "f1", rightId: "f2", side: "front", available: true },
  { leftId: "f3", rightId: "f4", side: "front", available: false },
  { leftId: "b1", rightId: "b2", side: "back", available: false },
];

export const catalog: EditionCatalog = {
  id: "00000000-0000-4000-8000-000000000101",
  zoneName: "Central Westchester",
  households: 5000,
  issueMonth: "2027-01-01",
  artworkDeadline: "2099-12-15T04:59:59Z",
  unitPriceCents: 50000,
  doublePriceCents: 90000,
  bookable: true,
  totalUnits: slots.length,
  availableUnits: slots.filter((s) => s.available).length,
  slots,
  pairs,
};
