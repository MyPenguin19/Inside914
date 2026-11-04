import { afterEach, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Filters } from "@/components/admin/filters";
import { campaignNextStep, campaignSection } from "@/lib/admin/workflow";
import { campaignStats, type AdminEdition } from "@/lib/admin/metrics";

afterEach(cleanup);
const now = Date.parse("2026-11-03T12:00:00Z");
const edition: AdminEdition = { id: "campaign", zoneName: "Northern Westchester", households: 5000, issueMonth: "2027-01-01", artworkDeadline: "2026-12-15T23:59:00Z", mailDate: null, status: "open" };
const stats = { ...campaignStats(edition, [], [], now), totalUnits: 10, sellableUnits: 10, reservedUnits: 4, fullyReserved: false };

test("expired, paused and finished campaigns never prompt the owner to invite more advertisers", () => {
  expect(campaignNextStep({ ...edition, artworkDeadline: "2026-11-01" }, stats, now).title).toBe("Choose what happens next");
  expect(campaignNextStep({ ...edition, pausedAt: "2026-11-02" }, stats, now).title).toBe("Reservations are paused");
  for (const status of ["cancelled", "completed", "mailed"]) expect(campaignNextStep({ ...edition, status }, stats, now).href).toContain("view=settings");
  expect(campaignNextStep({ ...edition, archivedAt: "2026-11-02" }, stats, now).title).toBe("Campaign archived");
});

test("full campaigns with unreviewed ads lead to that campaign’s queue, not another campaign", () => {
  const full = { ...stats, fullyReserved: true, reservedUnits: 10, artworkAwaitingReview: 2 };
  expect(campaignNextStep(edition, full, now).href).toBe("/admin/artwork?campaign=campaign");
  const next = campaignNextStep(edition, { ...full, artworkAwaitingReview: 0 }, now);
  expect(next.href).toBe("/admin/campaigns/campaign?view=mailing");
  expect(next.detail).toContain("requirement is checked"); // Full alone does not mean paid or ready to mail.
  expect(campaignSection(["settings"])).toBe("overview");
  expect(campaignSection("unknown")).toBe("overview");
});

test("All is explicit and status changes keep the search and campaign together", () => {
  render(<Filters base="/admin/artwork" filter="pending" filters={[["pending", "Awaiting review"], ["all", "All"]]} q="A & B" campaign="campaign" campaigns={[{id:"campaign",label:"North"}]} />);
  const url = new URL(screen.getByRole("link", {name:"All"}).getAttribute("href")!, "http://localhost");
  expect(Object.fromEntries(url.searchParams)).toEqual({filter:"all",q:"A & B",campaign:"campaign"});
  const form = screen.getByRole("search") as HTMLFormElement;
  expect(Object.fromEntries(new FormData(form))).toEqual({filter:"pending",q:"A & B",campaign:"campaign"});
});

test("Clear search removes the query while keeping the campaign and status", () => {
  render(<Filters base="/admin/payments" filter="all" filters={[["confirmed", "Reservations"], ["all", "All"]]} q="Bakery" campaign="campaign" campaigns={[{id:"campaign",label:"North"}]} />);
  expect(new FormData(screen.getByRole("search") as HTMLFormElement).get("filter")).toBe("all");
  expect(screen.getByRole("link", {name:"Clear search"}).getAttribute("href")).toBe("/admin/payments?filter=all&campaign=campaign");
});
