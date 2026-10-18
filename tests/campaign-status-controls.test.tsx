import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AdminEdition, CampaignStats } from "@/lib/admin/metrics";

// The server actions are replaced: this checks which controls an admin is offered.
vi.mock("@/app/admin/admin-actions", () => ({ setCampaignStatus: vi.fn(), extendDeadline: vi.fn() }));
const { CampaignStatusControls } = await import("@/components/admin/campaign-status-controls");

afterEach(cleanup);

const NOW = Date.parse("2026-12-20T12:00:00Z");
const edition: AdminEdition = {
  id: "e1",
  zoneName: "Central Westchester",
  households: 5000,
  issueMonth: "2027-01-01",
  artworkDeadline: "2026-12-16T04:59:59Z", // passed
  mailDate: "2027-01-05",
  status: "closed",
};
const stats = (over: Partial<CampaignStats>) =>
  ({ totalUnits: 16, blockedUnits: 0, sellableUnits: 16, reservedUnits: 9, reservations: 7, fullyReserved: false, ...over }) as CampaignStats;

describe("campaign controls at a missed deadline", () => {
  test("explain the situation and offer extend or cancel-with-reservations", () => {
    render(<CampaignStatusControls edition={edition} stats={stats({})} now={NOW} />);
    expect(screen.getByRole("alert").textContent).toMatch(/Deadline passed: 9 of 16 spaces reserved/);
    expect(screen.getByText("Extend the deadline")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel campaign (didn't fill)" })).toBeTruthy();
  });

  test("a full campaign past its deadline gets no such panel or cancel", () => {
    render(<CampaignStatusControls edition={edition} stats={stats({ reservedUnits: 16, fullyReserved: true })} now={NOW} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: /Cancel campaign/ })).toBeNull();
  });

  test("before the deadline, a campaign with reservations can't be canceled", () => {
    render(<CampaignStatusControls edition={{ ...edition, status: "open" }} stats={stats({})} now={Date.parse("2026-12-01T00:00:00Z")} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: /Cancel campaign/ })).toBeNull();
  });
});
