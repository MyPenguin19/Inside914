import { AMAZINGMAIL_9X6_LAYOUT, fileToTrim } from "@/lib/print/amazingmail-layout";
import { SQUARE_PRODUCT } from "@/lib/booking/square-product";

// Layout geometry uses inches from the trimmed card's top-left. Historical campaigns
// retain their 6.5 × 12 layout. New drafts use the provisional 9 × 6 square template;
// neither template is printer-approved.

export type TemplateSlot = { side: "front" | "back"; label: string; x: number; y: number; width: number; height: number };
export type LayoutTemplate = { key: string; label: string; description: string; approved: boolean; slots: TemplateSlot[] };

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

export const SQUARE_TEMPLATE: LayoutTemplate = {
  key: SQUARE_PRODUCT.layoutKey,
  label: "9 × 6 postcard — 10 square ads",
  description: "Ten paid 2.5″ square positions: six front, four back. Postal and house regions are excluded. Printer clearance approval is still required before opening.",
  approved: false,
  slots: AMAZINGMAIL_9X6_LAYOUT.paidSlots.map(fileToTrim),
};

export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    key: "provisional-2x4",
    approved: false,
    label: "Provisional 2 × 4 grid per side (16 spaces)",
    description: "Eight 3.25″ × 3″ spaces on each side, as in the current campaign. Not approved: no mailing panel, postage, branding, bleed or safe margins are reserved. Inventory is provisional and cannot open for reservations.",
    slots: [...grid("front", 4, 0, 3), ...grid("back", 4, 0, 3)],
  },
  SQUARE_TEMPLATE,
];

export const findTemplate = (key: string) => LAYOUT_TEMPLATES.find((t) => t.key === key) ?? null;
