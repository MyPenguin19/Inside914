const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const usdWithCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatPrice(cents: number) {
  return (cents % 100 === 0 ? usd : usdWithCents).format(cents / 100);
}

// "2027-01-01" -> "January 2027" (date-only strings, read as UTC so the month never shifts).
export function formatIssueMonth(isoDate: string) {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDeadline(isoTimestamp: string) {
  return new Date(isoTimestamp).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

export function formatHouseholds(count: number) {
  return new Intl.NumberFormat("en-US").format(count);
}

// "2027-01-05" -> "January 5, 2027" (date-only, read as UTC so the day never shifts).
export function formatDay(isoDate: string) {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
