// Formatting used by admin pages (re-exported so pages import from one place).
export { formatDay, formatDeadline, formatHouseholds, formatIssueMonth, formatPrice } from "@/lib/format";
export { formatPhone } from "@/lib/checkout/contact";

export function formatTimestamp(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}
