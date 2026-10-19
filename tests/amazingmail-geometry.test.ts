import { describe, expect, test } from "vitest";
import { LAYOUT_TEMPLATES } from "@/lib/admin/layouts";
import { AMAZINGMAIL_9X6_LAYOUT as layout, type PrintRectangle } from "@/lib/print/amazingmail-layout";
import { AMAZINGMAIL_9X6_SPEC as spec, PRINT_SPEC } from "@/lib/print/spec";

// Compare integer millionths; do not hide a postal overlap behind float tolerance.
const u = (n: number) => Math.round(n * 1_000_000);
const right = (r: PrintRectangle) => u(r.x) + u(r.width);
const bottom = (r: PrintRectangle) => u(r.y) + u(r.height);
const inside = (a: PrintRectangle, b: PrintRectangle) =>
  u(a.x) >= u(b.x) && u(a.y) >= u(b.y) && right(a) <= right(b) && bottom(a) <= bottom(b);
const overlaps = (a: PrintRectangle, b: PrintRectangle) =>
  u(a.x) < right(b) && right(a) > u(b.x) && u(a.y) < bottom(b) && bottom(a) > u(b.y);

describe("AmazingMail 566132 nominal geometry (not printer approval)", () => {
  test("reproduces the labeled file, centered trim and live bounds", () => {
    expect(layout.coordinateSystem).toBe("file-top-left");
    expect(layout.file).toEqual({ x: 0, y: 0, width: 9.125, height: 6.125 });
    expect(layout.trim).toEqual({ x: 0.0625, y: 0.0625, width: 9, height: 6 });
    expect(layout.live).toEqual({ x: 0.1875, y: 0.1875, width: 8.75, height: 5.75 });
    expect(inside(layout.live, layout.trim)).toBe(true);
    expect(inside(layout.trim, layout.file)).toBe(true);
  });

  test("preserves front/back source provenance and the file-edge postal anchor", () => {
    expect(spec.sources.front).toBe("https://assets.xpressdocs.com/dserv/tpl/1500/2/566132.jpg");
    expect(spec.sources.back).toBe("https://assets.xpressdocs.com/dserv/tpl/1500/1/566132.jpg");
    expect(spec.postalAnchor).toBe("file-bottom-right");
    expect(layout.postal).toEqual({ side: "back", x: 5.2, y: 2.795, width: 3.925, height: 3.33 });
    expect(right(layout.postal)).toBe(right(layout.file));
    expect(bottom(layout.postal)).toBe(bottom(layout.file));
  });

  test("contains exactly ten paid positions, six front and four back", () => {
    expect(layout.paidSlots.map((s) => s.label)).toEqual(["F1", "F2", "F3", "F4", "F5", "F6", "B1", "B2", "B3", "B4"]);
    expect(layout.paidSlots.filter((s) => s.side === "front")).toHaveLength(6);
    expect(layout.paidSlots.filter((s) => s.side === "back")).toHaveLength(4);
  });

  test("keeps every paid tile exactly 2.5 inches square without resizing", () => {
    for (const slot of layout.paidSlots) {
      expect(slot.width).toBe(2.5);
      expect(slot.height).toBe(2.5);
    }
  });

  test("keeps all paid and house artwork regions inside the live rectangle", () => {
    for (const region of [...layout.paidSlots, ...layout.houseRegions]) {
      expect(region.width).toBeGreaterThan(0);
      expect(region.height).toBeGreaterThan(0);
      expect(inside(region, layout.live)).toBe(true);
    }
  });

  test("has no positive-area overlap between regions on the same side", () => {
    const regions = [...layout.paidSlots, ...layout.houseRegions];
    for (let i = 0; i < regions.length; i++) {
      for (const other of regions.slice(i + 1)) {
        if (regions[i].side === other.side) expect(overlaps(regions[i], other)).toBe(false);
      }
    }
  });

  test("keeps all back artwork outside the entire postal exclusion", () => {
    for (const region of [...layout.paidSlots, ...layout.houseRegions].filter((r) => r.side === "back")) {
      expect(overlaps(region, layout.postal)).toBe(false);
    }
  });

  test("places front squares in three columns and two rows", () => {
    const front = layout.paidSlots.filter((s) => s.side === "front");
    expect([...new Set(front.map((s) => s.x))]).toEqual([0.8125, 3.3125, 5.8125]);
    expect([...new Set(front.map((s) => s.y))]).toEqual([0.5625, 3.0625]);
  });

  test("fits the back only with the documented zero column gutter", () => {
    const [b1, b2, b3, b4] = layout.paidSlots.filter((s) => s.side === "back");
    expect(right(b1)).toBe(u(b2.x));
    expect(right(b3)).toBe(u(b4.x));
    expect(u(layout.postal.x) - right(b2)).toBe(12_500);
    expect(u(layout.postal.x) - right(b4)).toBe(12_500);
    // A 1/64-inch shift exceeds the available clearance and must not be called safe.
    expect(overlaps({ ...b4, x: b4.x + 1 / 64 }, layout.postal)).toBe(true);
  });

  test("reserves two separate house regions above the postal panel, outside inventory", () => {
    expect(layout.houseRegions.map((r) => r.id)).toEqual(["inside914", "inside-diagnostics"]);
    for (const region of layout.houseRegions) {
      expect(region.side).toBe("back");
      expect(region.width).toBe(3.7375);
      expect(region.height).toBe(1.30375);
      expect(bottom(region)).toBeLessThanOrEqual(u(layout.postal.y));
      expect(region).not.toHaveProperty("label");
    }
    const lowerHouse = layout.houseRegions[1];
    // No hidden extra postal margin: adding even 0.001 inch enters the exclusion.
    expect(bottom(lowerHouse)).toBe(u(layout.postal.y));
    expect(overlaps({ ...lowerHouse, height: lowerHouse.height + 0.001 }, layout.postal)).toBe(true);
  });

  test("does not enable this candidate or change the active legacy postcard", () => {
    expect(layout.approved).toBe(false);
    expect(spec.status).toBe("provisional");
    expect(LAYOUT_TEMPLATES.some((t) => t.key === layout.key)).toBe(false);
    expect(PRINT_SPEC.trimInches).toEqual({ width: 6.5, height: 12 });
    expect(PRINT_SPEC.bleedInches).toBeNull();
  });
});
