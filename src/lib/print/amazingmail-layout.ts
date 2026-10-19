import { AMAZINGMAIL_9X6_SPEC as spec } from "./spec";

export type PrintRectangle = Readonly<{ x: number; y: number; width: number; height: number }>;

// Calculate in integer millionths of an inch; expose inches at the boundary.
// All coordinates use the upload file's top-left, NOT the trimmed card's origin.
const units = (inches: number) => Math.round(inches * 1_000_000);
const inches = (r: PrintRectangle): PrintRectangle => ({
  x: r.x / 1_000_000, y: r.y / 1_000_000,
  width: r.width / 1_000_000, height: r.height / 1_000_000,
});
const file = { x: 0, y: 0, width: units(spec.fileInches.width), height: units(spec.fileInches.height) };
const centered = (size: { width: number; height: number }): PrintRectangle => {
  const width = units(size.width), height = units(size.height);
  return { x: (file.width - width) / 2, y: (file.height - height) / 2, width, height };
};
const trim = centered(spec.trimInches);
const live = centered(spec.liveInches);
const postal = {
  x: file.width - units(spec.postalPanelInches.width),
  y: file.height - units(spec.postalPanelInches.height),
  width: units(spec.postalPanelInches.width),
  height: units(spec.postalPanelInches.height),
};
const tile = units(spec.paidTileInches);
const top = live.y + (live.height - 2 * tile) / 2;

function paidGrid(side: "front" | "back", columns: number, left: number) {
  return Array.from({ length: columns * 2 }, (_, i) => ({
    side,
    label: `${side === "front" ? "F" : "B"}${i + 1}`,
    ...inches({ x: left + (i % columns) * tile, y: top + Math.floor(i / columns) * tile, width: tile, height: tile }),
  }));
}

// Region allocations only, not final house artwork. Split the available rectangle
// equally into two stacked regions. Their common edge and the lower postal edge
// have no additional gutter. Final content/clearance approval is still required.
const houseWidth = live.x + live.width - postal.x;
const houseHeight = (postal.y - live.y) / 2;
const houseRegions = ["inside914", "inside-diagnostics"].map((id, index) => ({
  id,
  side: "back" as const,
  ...inches({ x: postal.x, y: live.y + index * houseHeight, width: houseWidth, height: houseHeight }),
}));

// Used for draft inventory only. This does not grant printer approval.
export const AMAZINGMAIL_9X6_LAYOUT = {
  key: "amazingmail-9x6-ten-square-draft",
  approved: false,
  coordinateSystem: "file-top-left",
  file: inches(file),
  trim: inches(trim),
  live: inches(live),
  postal: { side: "back" as const, ...inches(postal) },
  paidSlots: [
    ...paidGrid("front", 3, live.x + (live.width - 3 * tile) / 2),
    ...paidGrid("back", 2, live.x),
  ],
  houseRegions,
} as const;

// Translate every kind of region through the same origin conversion. Do not clip
// postal bounds to trim: the exclusion deliberately extends into the bleed.
export function fileToTrim<T extends PrintRectangle>(region: T): T {
  return { ...region, x: (units(region.x) - trim.x) / 1_000_000, y: (units(region.y) - trim.y) / 1_000_000 };
}

// A limit for the existing two-column/two-row back arrangement, not a packing
// optimizer or permission to resize. Printer-specified allowances must be
// supplied explicitly; unknown allowances must never be treated as approved zero.
export function backSquareFit(allowances: {
  columnGap: number; rowGap: number; postalClearance: number;
}) {
  for (const value of Object.values(allowances)) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError("Clearances must be finite, nonnegative inches");
  }
  const width = postal.x - live.x - units(allowances.columnGap) - units(allowances.postalClearance);
  const height = live.height - units(allowances.rowGap);
  const maximum = Math.max(0, Math.floor(Math.min(width, height) / 2));
  return {
    maximumSquareInches: maximum / 1_000_000,
    fitsRequestedTile: tile <= maximum,
    horizontalRemainderInches: (width - 2 * tile) / 1_000_000,
  };
}
