// Postcard layout templates an admin can start a campaign from. Geometry in inches on the
// 6.5" x 12" card, like every slot in the database. PROVISIONAL until the printer's template
// arrives; the chosen template's key is stored on the campaign and its slots are copied in.

export type TemplateSlot = { side: "front" | "back"; label: string; x: number; y: number; width: number; height: number };
export type LayoutTemplate = { key: string; label: string; description: string; slots: TemplateSlot[] };

function grid(side: "front" | "back", rows: number, top: number, unitHeight: number): TemplateSlot[] {
  return Array.from({ length: rows * 2 }, (_, i) => ({
    side,
    label: `${side === "front" ? "F" : "B"}${i + 1}`,
    x: (i % 2) * 3.25,
    y: Math.round((top + Math.floor(i / 2) * unitHeight) * 1000) / 1000,
    width: 3.25,
    height: unitHeight,
  }));
}

export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    key: "provisional-2x4",
    label: "Provisional 2 × 4 grid per side (16 spaces)",
    description: "Eight 3.25″ × 3″ spaces on each side, as in the current campaign. Not the approved print layout.",
    slots: [...grid("front", 4, 0, 3), ...grid("back", 4, 0, 3)],
  },
];

export const findTemplate = (key: string) => LAYOUT_TEMPLATES.find((t) => t.key === key) ?? null;
