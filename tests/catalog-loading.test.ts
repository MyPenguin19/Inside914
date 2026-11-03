import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/booking/cart", () => ({ createCart: vi.fn() }));
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => ({ from }) }));
import { categoryCatalog } from "@/lib/booking/category-checkout";
import { getEditionCatalog } from "@/lib/catalog/queries";

const editions = ["central", "southern", "northern", "eastern"].map((area, i) => ({
  id: area, product_model: "square_v1", layout_template: "amazingmail-9x6-v2",
  issue_month: "2098-04-01", artwork_deadline: "2098-03-20T23:59:00Z", mail_date: null,
  status: "open", reservations_paused_at: null, reservations_open_at: null,
  unit_price_cents: i === 2 ? 100 : 39900, double_unit_price_cents: null,
  zones: { slug: `${area}-westchester`, name: `${area} Westchester`, household_count: 5000 },
}));
const slots = editions.flatMap(e => Array.from({ length: 10 }, (_, i) => ({
  edition_id: e.id, slot_id: `${e.id}-${i}`, side: i < 6 ? "front" : "back",
  label: i < 6 ? `F${i + 1}` : `B${i - 5}`, x_in: i, y_in: 0, width_in: 2.5, height_in: 2.5,
  available: i !== 0, occupancy: i === 0 ? "held" : "available",
})));
let editionRows: Record<string, unknown>[];
let slotRows: Record<string, unknown>[];
let failedTable: string | undefined;
let editionWait: Promise<void> | undefined;

beforeEach(() => {
  vi.stubEnv("INSIDE914_PRICING_MODE", "launch");
  editionRows = editions.map(e => ({ ...e }));
  slotRows = slots.map(s => ({ ...s }));
  failedTable = undefined;
  editionWait = undefined;
  from.mockReset().mockImplementation((table: string) => {
    let rows: Record<string, unknown>[] = table === "editions" ? editionRows : table === "slot_availability" ? slotRows : [];
    let single = false;
    const query = {
      select: () => query, order: () => query, returns: () => query,
      eq: (key: string, value: unknown) => { rows = rows.filter(r => (r as Record<string, unknown>)[key] === value); return query; },
      in: (key: string, values: unknown[]) => { rows = rows.filter(r => values.includes((r as Record<string, unknown>)[key])); return query; },
      gt: (key: string, value: string) => { rows = rows.filter(r => String(r[key]) > value); return query; },
      maybeSingle: () => { single = true; return query; },
      then: (resolve: (value: unknown) => void) => Promise.resolve(table === "editions" ? editionWait : undefined)
        .then(() => ({ data: single ? rows[0] ?? null : rows, error: failedTable === table ? { message: "unavailable" } : null })).then(resolve),
    };
    return query;
  });
});
afterEach(() => vi.unstubAllEnvs());

test("four areas load in two reads with current inventory and campaign prices", async () => {
  const result = await categoryCatalog();
  expect(result.editions).toHaveLength(4);
  expect(result.editions.map(e => e.availableUnits)).toEqual([9, 9, 9, 9]);
  expect(result.editions[2].unitPriceCents).toBe(100);
  expect(from).toHaveBeenCalledTimes(2);
  expect(from.mock.calls.map(([table]) => table)).toEqual(["editions", "slot_availability"]);
  expect(result.editions[0].slots[0]).toMatchObject({ label: "F1", available: false, occupancy: "held", width: 2.5, height: 2.5 });
  expect(result.editions.every(e => e.slots.length === 10 && e.pairs.length === 0)).toBe(true);
});

test("availability is re-read on every visit, not retained across customers", async () => {
  expect((await categoryCatalog()).editions[0].availableUnits).toBe(9);
  slotRows[1].available = false;
  slotRows[1].occupancy = "reserved";
  expect((await categoryCatalog()).editions[0].availableUnits).toBe(8);
  expect(from).toHaveBeenCalledTimes(4);
});

test.each([
  { status: "draft" }, { reservations_paused_at: "2026-01-01" },
  { artwork_deadline: "2020-01-01" }, { reservations_open_at: "2099-01-01" },
  { zones: { slug: "unknown" } }, { product_model: "legacy" },
])("unbookable or unknown campaigns stay excluded: %j", async patch => {
  Object.assign(editionRows[0], patch);
  expect((await categoryCatalog()).editions.map(e => e.id)).toEqual(["southern", "northern", "eastern"]);
});

test("empty catalog skips availability reads", async () => {
  editionRows = [];
  expect((await categoryCatalog()).editions).toEqual([]);
  expect(from).toHaveBeenCalledTimes(1);
});

test.each(["editions", "slot_availability"])("%s failures do not show invented inventory", async table => {
  failedTable = table;
  await expect(categoryCatalog()).rejects.toThrow("Could not load");
});

test("a single catalog starts independent reads before its edition response arrives", async () => {
  let finish!: () => void;
  editionWait = new Promise(resolve => { finish = resolve; });
  const result = getEditionCatalog("central");
  expect(from.mock.calls.map(([table]) => table)).toEqual(["editions", "slot_availability", "slot_pairs"]);
  finish();
  expect((await result)?.slots).toHaveLength(10);
});
