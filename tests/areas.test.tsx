import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AreaCards } from "@/components/booking/area-cards";
import { areaCardsFrom } from "@/lib/catalog/areas";
import type { EditionSummary } from "@/lib/catalog/queries";
import { catalog } from "./fixtures/catalog";

const getBookableEditions = vi.fn<() => Promise<EditionSummary[]>>();
vi.mock("@/lib/catalog/queries", () => ({ getBookableEditions: () => getBookableEditions() }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("server-only", () => ({}));

afterEach(() => {
  cleanup();
  getBookableEditions.mockReset();
});

const open: EditionSummary = { ...catalog, availableUnits: 13, totalUnits: 16 };
const planned = [
  { slug: "central-westchester", name: "Central Westchester" },
  { slug: "northern-westchester", name: "Northern Westchester" },
];

describe("areaCardsFrom", () => {
  test("an open edition becomes an available card with its real counts, prices and dates", () => {
    const [card] = areaCardsFrom([open], []);
    expect(card).toMatchObject({
      status: "available",
      name: "Central Westchester",
      openSpaces: 13,
      totalSpaces: 16,
      unitPriceCents: open.unitPriceCents,
      doublePriceCents: open.doublePriceCents,
      reserveBy: open.artworkDeadline,
      mailDate: open.mailDate,
      href: `/editions/${open.id}`,
    });
  });

  test("an edition with no open spaces is shown as fully reserved, with no booking link", () => {
    const [card] = areaCardsFrom([{ ...open, availableUnits: 0 }], []);
    expect(card.status).toBe("full");
    expect(card).not.toHaveProperty("href");
  });

  test("planned areas are 'coming soon' only while no campaign exists for them", () => {
    const cards = areaCardsFrom([open], planned);
    expect(cards.map((c) => [c.name, c.status])).toEqual([
      ["Central Westchester", "available"],
      ["Northern Westchester", "soon"],
    ]);
  });

  test("no campaigns: only planned areas, never an invented one", () => {
    expect(areaCardsFrom([], planned).every((c) => c.status === "soon")).toBe(true);
    expect(areaCardsFrom([], [])).toEqual([]);
  });
});

describe("AreaCards", () => {
  test("available card shows the database values and links to the edition", () => {
    render(<AreaCards areas={areaCardsFrom([open], planned)} />);
    expect(screen.getByText("13 of 16")).toBeTruthy();
    expect(screen.getByText("$500 / $900")).toBeTruthy();
    expect(screen.getByText("January 5, 2100")).toBeTruthy(); // date-only, never shifted by time zone
    expect(screen.getByRole("link", { name: /See open spaces.*Central Westchester/ }).getAttribute("href")).toBe(`/editions/${open.id}`);
    expect(screen.getAllByText("Coming soon")).toHaveLength(2); // edition line + badge on Northern Westchester
  });

  test("fully reserved and coming-soon cards have no booking link", () => {
    render(<AreaCards areas={areaCardsFrom([{ ...open, availableUnits: 0 }], planned)} />);
    expect(screen.getByText("Fully reserved")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("LiveAreas", () => {
  test("no open campaigns: says so instead of showing an empty page", async () => {
    getBookableEditions.mockResolvedValue([]);
    const { LiveAreas } = await import("@/components/booking/live-areas");
    render(await LiveAreas());
    expect(screen.getByText("No campaigns are open for booking right now.")).toBeTruthy();
  });

  test("database failure: shows an error and no availability", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getBookableEditions.mockRejectedValue(new Error("connection refused"));
    const { LiveAreas } = await import("@/components/booking/live-areas");
    render(await LiveAreas());
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t load the advertising areas/);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
