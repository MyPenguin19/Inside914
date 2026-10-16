// Pure booking-selection rules shared by the postcard UI and the hold server action.
// Which units can form a double is decided by the database (public.slot_pairs), not here.

export type Side = "front" | "back";
export type SizeMode = "standard" | "double";

export type CatalogSlot = {
  id: string;
  side: Side;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  available: boolean;
};

export type SlotPair = { leftId: string; rightId: string; side: Side; available: boolean };

export type Availability = { slots: Record<string, boolean>; pairs: SlotPair[] };

export type Pricing = { unitPriceCents: number; doublePriceCents: number | null };

// Trim size of the provisional piece. Slot geometry comes from the database.
export const POSTCARD_INCHES = { width: 6.5, height: 12 } as const;

export function isDoubleOffered(pricing: Pricing, pairs: SlotPair[]) {
  return pricing.doublePriceCents !== null && pairs.length > 0;
}

export function priceFor(mode: SizeMode, pricing: Pricing) {
  return mode === "standard" ? pricing.unitPriceCents : pricing.doublePriceCents;
}

// The slot ids a click on `slotId` would select, or null if it can't be selected in this mode.
export function selectionForSlot(slotId: string, mode: SizeMode, slots: CatalogSlot[], pairs: SlotPair[]) {
  if (mode === "standard") {
    return slots.some((s) => s.id === slotId && s.available) ? [slotId] : null;
  }
  const pair =
    pairs.find((p) => p.available && p.leftId === slotId) ?? pairs.find((p) => p.available && p.rightId === slotId);
  return pair ? [pair.leftId, pair.rightId] : null;
}

export function isSelectable(slotId: string, mode: SizeMode, slots: CatalogSlot[], pairs: SlotPair[]) {
  return selectionForSlot(slotId, mode, slots, pairs) !== null;
}

// Is this exact selection still bookable under the given availability?
export function isSelectionAvailable(slotIds: string[], availability: Availability) {
  if (slotIds.length === 1) return availability.slots[slotIds[0]] === true;
  if (slotIds.length === 2) {
    const [a, b] = slotIds;
    return availability.pairs.some(
      (p) => p.available && ((p.leftId === a && p.rightId === b) || (p.leftId === b && p.rightId === a)),
    );
  }
  return false;
}

export function applyAvailability(slots: CatalogSlot[], availability: Availability): CatalogSlot[] {
  return slots.map((s) => ({ ...s, available: availability.slots[s.id] ?? false }));
}

// Seconds left on a hold; 0 once it has expired.
export function holdSecondsLeft(expiresAt: string, now: number = Date.now()) {
  return Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000));
}
