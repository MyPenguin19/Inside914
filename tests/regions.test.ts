import { describe, expect, test } from "vitest";
import { REGIONS, findRegion, regionalDraftDefaults } from "@/lib/catalog/regions";
import { areaCardsFrom } from "@/lib/catalog/areas";
import { assertLocalAreaSetup } from "../scripts/dev-setup-areas.mjs";
import { catalog } from "./fixtures/catalog";

describe("four-area campaign foundation", () => {
  test("one canonical entry per requested area, with no invented routes or quantities", () => {
    expect(REGIONS.map((area) => area.name)).toEqual(["Central Westchester", "Southern Westchester", "Northern Westchester", "Eastern Westchester"]);
    expect(new Set(REGIONS.map((area) => area.slug)).size).toBe(4);
    for (const area of REGIONS) expect(Object.keys(area)).toEqual(["slug", "name"]);
    expect(findRegion("southern-westchester")?.name).toBe("Southern Westchester");
    expect(findRegion("unknown")).toBeNull();
  });
  test("unpublished areas reuse coming-soon cards without dates, counts or booking links", () => {
    const empty = areaCardsFrom([]);
    expect(empty).toHaveLength(4);
    for (const card of empty) {
      expect(card.status).toBe("soon");
      expect(card).not.toHaveProperty("households");
      expect(card).not.toHaveProperty("href");
      expect(card).not.toHaveProperty("reserveBy");
    }
    const withCentral = areaCardsFrom([{ ...catalog, totalUnits: 16, availableUnits: 16 }]);
    expect(withCentral).toHaveLength(4);
    expect(withCentral.filter((card) => card.name === "Central Westchester")).toHaveLength(1);
    expect(withCentral.filter((card) => card.status === "soon")).toHaveLength(3);
  });
  test("draft defaults reuse a supplied estimate and leave unknown estimates and dates unset", () => {
    expect(regionalDraftDefaults({ name: "Southern Westchester", household_count: 0 })).toEqual({ name: "Southern Westchester", target_quantity: "" });
    expect(regionalDraftDefaults({ name: "Central Westchester", household_count: 5000 })).toEqual({ name: "Central Westchester", target_quantity: "5000" });
  });
  test.each(["http://localhost:54321", "http://127.0.0.1:54321/"])("allows existing isolated stack %s", (url) => {
    expect(() => assertLocalAreaSetup(url)).not.toThrow();
  });
  test.each(["https://hsexthbomretpmqolkqw.supabase.co", "https://other.supabase.co", "https://localhost:54321", "http://localhost:3000", "http://127.0.0.1.example.com:54321", "http://localhost:54321/other", "invalid"])("refuses unsafe local setup target %s before authentication", (url) => {
    expect(() => assertLocalAreaSetup(url)).toThrow();
  });
});
