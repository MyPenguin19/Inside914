import { describe, expect, test } from "vitest";
import {
  applyAvailability,
  holdSecondsLeft,
  isDoubleOffered,
  isSelectable,
  isSelectionAvailable,
  priceFor,
  selectionForSlot,
} from "@/lib/booking/selection";
import { pairs, slots } from "./fixtures/catalog";

const pricing = { unitPriceCents: 50000, doublePriceCents: 90000 };

describe("standard selection", () => {
  test("selects an available position on its own", () => {
    expect(selectionForSlot("f1", "standard", slots, pairs)).toEqual(["f1"]);
  });

  test("rejects an unavailable position", () => {
    expect(selectionForSlot("f4", "standard", slots, pairs)).toBeNull();
    expect(isSelectable("b1", "standard", slots, pairs)).toBe(false);
  });

  test("costs the standard unit price", () => {
    expect(priceFor("standard", pricing)).toBe(50000);
  });
});

describe("double-size selection", () => {
  test("selecting either half of an available pair selects both, left first", () => {
    expect(selectionForSlot("f1", "double", slots, pairs)).toEqual(["f1", "f2"]);
    expect(selectionForSlot("f2", "double", slots, pairs)).toEqual(["f1", "f2"]);
  });

  test("an open unit whose neighbor is reserved can't be a double", () => {
    expect(slots.find((s) => s.id === "f3")?.available).toBe(true);
    expect(selectionForSlot("f3", "double", slots, pairs)).toBeNull();
  });

  test("only database-listed pairs count: a unit with no pair is never double-selectable", () => {
    expect(selectionForSlot("f1", "double", slots, [])).toBeNull();
  });

  test("costs the double price, and isn't offered without a price or pairs", () => {
    expect(priceFor("double", pricing)).toBe(90000);
    expect(isDoubleOffered(pricing, pairs)).toBe(true);
    expect(isDoubleOffered({ ...pricing, doublePriceCents: null }, pairs)).toBe(false);
    expect(isDoubleOffered(pricing, [])).toBe(false);
  });
});

describe("re-checking a selection against fresh availability", () => {
  const fresh = { slots: { f1: true, f2: false, f3: true }, pairs: [{ ...pairs[0], available: false }] };

  test("a single position taken in the meantime is no longer available", () => {
    expect(isSelectionAvailable(["f1"], fresh)).toBe(true);
    expect(isSelectionAvailable(["f2"], fresh)).toBe(false);
  });

  test("a double is available only as a listed, available pair (in either order)", () => {
    expect(isSelectionAvailable(["f1", "f2"], fresh)).toBe(false);
    const open = { ...fresh, pairs: [pairs[0]] };
    expect(isSelectionAvailable(["f2", "f1"], open)).toBe(true);
    expect(isSelectionAvailable(["f1", "f3"], open)).toBe(false);
  });

  test("applies fresh availability to the postcard; unknown slots become unavailable", () => {
    const updated = applyAvailability(slots, fresh);
    expect(updated.find((s) => s.id === "f2")?.available).toBe(false);
    expect(updated.find((s) => s.id === "b1")?.available).toBe(false);
  });

  test("a space taken since the page loaded shows as on hold (new claims always start as holds)", () => {
    const updated = applyAvailability(slots, fresh);
    expect(updated.find((s) => s.id === "f2")?.occupancy).toBe("held"); // was free, now taken
    expect(updated.find((s) => s.id === "f4")?.occupancy).toBe("reserved"); // already taken before
    expect(updated.find((s) => s.id === "f1")?.occupancy).toBe("available");
  });
});

describe("hold expiry", () => {
  const expiresAt = "2026-10-16T05:15:00Z";

  test("counts down in whole seconds", () => {
    expect(holdSecondsLeft(expiresAt, Date.parse("2026-10-16T05:00:00Z"))).toBe(900);
  });

  test("is 0 once the hold has expired", () => {
    expect(holdSecondsLeft(expiresAt, Date.parse("2026-10-16T05:15:00Z"))).toBe(0);
    expect(holdSecondsLeft(expiresAt, Date.parse("2026-10-16T06:00:00Z"))).toBe(0);
  });
});

describe("exclusive postcard selection", () => {
  const open = slots.map(s => ({ ...s, available: true }));
  test("selects all spaces on the chosen side, or both sides", () => {
    expect(selectionForSlot("f2", "full_side", open, pairs)).toEqual(["f1", "f2", "f3", "f4"]);
    expect(selectionForSlot("b2", "full_side", open, pairs)).toEqual(["b1", "b2"]);
    expect(selectionForSlot("f2", "both_sides", open, pairs)).toEqual(open.map(s => s.id));
  });
  test("one unavailable space prevents exclusive selection; empty/missing sides are refused", () => {
    expect(selectionForSlot("f1", "full_side", slots, pairs)).toBeNull();
    expect(selectionForSlot("f1", "both_sides", slots, pairs)).toBeNull();
    expect(selectionForSlot("missing", "both_sides", [], [])).toBeNull();
    expect(selectionForSlot("f1", "both_sides", open.filter(s => s.side === "front"), [])).toBeNull();
  });
  test("prices are per product, never multiplied by the number of slots", () => {
    const full = { ...pricing, fullSidePriceCents: 160000, bothSidesPriceCents: 290000 };
    expect(priceFor("full_side", full)).toBe(160000);
    expect(priceFor("both_sides", full)).toBe(290000);
    expect(priceFor("both_sides", pricing)).toBeNull();
  });
});
