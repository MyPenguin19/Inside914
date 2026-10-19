// Pure booking-selection rules shared by the postcard UI and the hold server action.
// Which units can form a double is decided by the database (public.slot_pairs), not here.
import { PRINT_SPEC } from "@/lib/print/spec";

export type Side = "front" | "back";
export type SizeMode = import("./products").BookingSize;

// Public occupancy (no booking details): held = someone is mid-checkout, reserved = confirmed.
export type Occupancy = "available" | "held" | "reserved" | "closed";

export type CatalogSlot = {
  id: string;
  side: Side;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  available: boolean;
  occupancy?: Occupancy;
};

export type SlotPair = { leftId: string; rightId: string; side: Side; available: boolean };

export type Availability = { slots: Record<string, boolean>; pairs: SlotPair[] };

export type Pricing = { unitPriceCents: number; doublePriceCents: number | null; fullSidePriceCents?: number; bothSidesPriceCents?: number };

// Trim size from the (provisional) print spec. Slot geometry comes from the database.
export const POSTCARD_INCHES = PRINT_SPEC.trimInches;

export function isDoubleOffered(pricing: Pricing, pairs: SlotPair[]) {
  return pricing.doublePriceCents !== null && pairs.length > 0;
}

export function priceFor(mode: SizeMode, pricing: Pricing) {
  if (mode === "full_side") return pricing.fullSidePriceCents ?? null;
  if (mode === "both_sides") return pricing.bothSidesPriceCents ?? null;
  return mode === "standard" ? pricing.unitPriceCents : pricing.doublePriceCents;
}

// The slot ids a click on `slotId` would select, or null if it can't be selected in this mode.
export function selectionForSlot(slotId: string, mode: SizeMode, slots: CatalogSlot[], pairs: SlotPair[]) {
  if (mode === "standard") {
    return slots.some((s) => s.id === slotId && s.available) ? [slotId] : null;
  }
  if (mode === "full_side" || mode === "both_sides") {
    const anchor = slots.find(s => s.id === slotId);
    if (!anchor) return null;
    const selected = slots.filter(s => mode === "both_sides" || s.side === anchor.side);
    if (mode === "both_sides" && new Set(selected.map(s => s.side)).size !== 2) return null;
    return selected.length && selected.every(s => s.available) ? selected.map(s => s.id) : null;
  }
  const pair =
    pairs.find((p) => p.available && p.leftId === slotId) ?? pairs.find((p) => p.available && p.rightId === slotId);
  return pair ? [pair.leftId, pair.rightId] : null;
}

export function isSelectable(slotId: string, mode: SizeMode, slots: CatalogSlot[], pairs: SlotPair[]) {
  return selectionForSlot(slotId, mode, slots, pairs) !== null;
}

// Is this exact selection still bookable under the given availability?
export function isSelectionAvailable(slotIds: string[], availability: Availability, mode?: SizeMode) {
  // Scope/completeness are authoritatively checked by hold_postcard under database locks.
  if (mode === "full_side" || mode === "both_sides") {
    return slotIds.length > 0 && new Set(slotIds).size === slotIds.length && slotIds.every(id => availability.slots[id] === true);
  }
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
  return slots.map((s) => {
    const available = availability.slots[s.id] ?? false;
    // A space that was free a moment ago was just claimed, and every new claim starts as a hold.
    const occupancy: Occupancy = available ? "available" : s.available ? "held" : (s.occupancy ?? "reserved");
    return { ...s, available, occupancy };
  });
}

// Seconds left on a hold; 0 once it has expired.
export function holdSecondsLeft(expiresAt: string, now: number = Date.now()) {
  return Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000));
}
