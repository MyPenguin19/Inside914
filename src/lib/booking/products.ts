export type BookingSize = "standard" | "double" | "full_side" | "both_sides";
export const BOOKING_SIZE_LABELS: Record<BookingSize, string> = {
  standard: "Standard", double: "Double", full_side: "Full side", both_sides: "Both sides",
};
export function bookingSizeLabel(size: BookingSize) { return BOOKING_SIZE_LABELS[size]; }
export function positionLabel(size: BookingSize, positions: { side: "front" | "back"; label: string }[]) {
  if (size === "both_sides") return "Front and back · all advertising spaces";
  const side = positions[0]?.side === "back" ? "Back" : "Front";
  return size === "full_side" ? `${side} · all advertising spaces` : `${side} · ${positions.map(p => p.label).join(" + ")}`;
}
