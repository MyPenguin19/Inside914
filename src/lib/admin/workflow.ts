import { deadlineMissed, type AdminEdition, type CampaignStats } from "./metrics";

export const CAMPAIGN_SECTIONS = [
  { key: "overview", label: "Overview" },
  { key: "advertisers", label: "Advertisers & spaces" },
  { key: "artwork", label: "Artwork" },
  { key: "mailing", label: "Print & mail" },
  { key: "settings", label: "Campaign settings" },
] as const;
export type CampaignSection = (typeof CAMPAIGN_SECTIONS)[number]["key"];
export const campaignSection = (value: unknown): CampaignSection =>
  CAMPAIGN_SECTIONS.find((section) => section.key === value)?.key ?? "overview";
export const campaignHref = (id: string, section: CampaignSection = "overview") =>
  `/admin/campaigns/${id}${section === "overview" ? "" : `?view=${section}`}`;

export function campaignStatusLabel(edition: AdminEdition) {
  if (edition.archivedAt) return "Archived";
  if (edition.pausedAt && edition.status === "open") return "Reservations paused";
  const labels: Record<string, string> = { draft: "Draft", open: "Taking reservations", closed: "Reservations closed", approved_to_print: "Approved for print", printed: "Printed", mailed: "Mailed", completed: "Completed", cancelled: "Cancelled" };
  return labels[edition.status] ?? edition.status.replaceAll("_", " ");
}

// Guidance only. Existing server actions and database rules still decide what is allowed.
export function campaignNextStep(edition: AdminEdition, stats: CampaignStats, now: number) {
  const step = (title: string, detail: string, label: string, href: string) => ({ title, detail, label, href });
  if (edition.archivedAt || ["cancelled", "completed", "mailed"].includes(edition.status)) {
    return step(edition.archivedAt ? "Campaign archived" : edition.status === "cancelled" ? "Campaign canceled" : "Mailing recorded",
      "Your advertiser, artwork and mailing records stay together in this campaign.", "View campaign records", campaignHref(edition.id, "settings"));
  }
  if (edition.status === "draft") return step("Finish setup, then open reservations", "Check the area, price and dates below. Open reservations when you are ready for customers to book.", "Review campaign details", campaignHref(edition.id, "settings"));
  if (deadlineMissed(edition, stats, now)) return step("Choose what happens next", "The deadline passed before this campaign filled. Review the reservations, then extend the deadline or cancel using the controls below.", "Review reservations", campaignHref(edition.id, "advertisers"));
  if (edition.pausedAt) return step("Reservations are paused", "Review this campaign, then use Resume reservations below when you are ready.", "Review spaces", campaignHref(edition.id, "advertisers"));
  if (!stats.fullyReserved) return step(edition.status === "closed" ? "Reservations are closed" : "Fill the remaining spaces", edition.status === "closed" ? "Review the campaign before reopening reservations with the controls below." : `${stats.reservedUnits} of ${stats.sellableUnits} spaces are reserved. Manage your advertisers and invitation links in one place.`, "Manage advertisers", campaignHref(edition.id, "advertisers"));
  if (stats.artworkAwaitingReview > 0) return step("Review the submitted ads", `${stats.artworkAwaitingReview} ads are waiting for your review. Check each one before preparing the final postcard.`, "Review artwork", `/admin/artwork?campaign=${edition.id}`);
  return step("Prepare the postcard for mailing", "Review the artwork, printer proof and payments in Print & mail. Each requirement is checked before you can continue.", "Go to Print & mail", campaignHref(edition.id, "mailing"));
}
