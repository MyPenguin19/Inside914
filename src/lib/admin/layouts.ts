import { AMAZINGMAIL_9X6_LAYOUT, fileToTrim } from "@/lib/print/amazingmail-layout";
import { POSTCARD_LAYOUT_V2, regionToTrim } from "@/lib/print/layouts";

// Layout geometry uses inches from the trimmed card's top-left. Historical campaigns
// retain their 6.5 × 12 layout. New drafts use the owner-approved 9 × 6 reservation layout.
// Historical layouts remain unapproved; final print proofs require separate review.

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
  key: AMAZINGMAIL_9X6_LAYOUT.key,
  label: "9 × 6 postcard — 10 square ads",
  description: "Ten paid 2.5″ square positions: six front, four back. Postal and house regions are excluded. Owner-approved reservation geometry; final house artwork and print proof require separate approval.",
  approved: AMAZINGMAIL_9X6_LAYOUT.approved,
  slots: AMAZINGMAIL_9X6_LAYOUT.paidSlots.map(fileToTrim),
};

export const V2_TEMPLATE: LayoutTemplate = {
  key: POSTCARD_LAYOUT_V2.key,
  label: "9 × 6 postcard V2 — 10 ads",
  description: "Six 2.78″ front squares and four 2.2925″ × 2.815″ back rectangles. House and postal panels are reserved. Reservation geometry only; final printer proof still required.",
  approved: POSTCARD_LAYOUT_V2.approved,
  slots: POSTCARD_LAYOUT_V2.paidSlots.map(r => regionToTrim(POSTCARD_LAYOUT_V2, r)),
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
  V2_TEMPLATE,
];

export const findTemplate = (key: string) => LAYOUT_TEMPLATES.find((t) => t.key === key) ?? null;
