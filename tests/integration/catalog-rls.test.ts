import { describe, expect, test } from "vitest";

// Calls PostgREST as the anon role, exactly as a logged-out browser would.
function anon(path: string, init: RequestInit = {}) {
  return fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY!,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

describe("catalog as anon", () => {
  test("reads the open edition's slots from slot_availability", async () => {
    const res = await anon("slot_availability?zone_slug=eq.central-westchester&select=*");
    expect(res.status).toBe(200);
    const rows: Record<string, unknown>[] = await res.json();

    expect(rows).toHaveLength(16); // provisional seed: 8 front + 8 back
    expect(new Set(rows.map((r) => r.issue_month))).toEqual(new Set(["2027-01-01"]));
    expect(Object.keys(rows[0]).sort()).toEqual(
      [
        "artwork_deadline", "available", "edition_id", "height_in", "household_count", "issue_month", "label",
        "side", "slot_id", "unit_price_cents", "width_in", "x_in", "y_in", "zone_name", "zone_slug",
      ].sort(),
    );
  });

  test("never sees draft editions", async () => {
    const res = await anon("slot_availability?issue_month=eq.2027-02-01&select=slot_id");
    expect(await res.json()).toEqual([]);
  });

  test("reads only published editions from base tables", async () => {
    const editions = await (await anon("editions?select=issue_month,status")).json();
    expect(editions).toEqual([{ issue_month: "2027-01-01", status: "open" }]);

    const slots = await (await anon("slots?select=id")).json();
    expect(slots).toHaveLength(16);
  });

  test("cannot read admins", async () => {
    const res = await anon("admins?select=*");
    expect(res.ok).toBe(false);
  });

  test("cannot write to slots", async () => {
    const res = await anon("slots", {
      method: "POST",
      body: JSON.stringify({
        edition_id: "00000000-0000-4000-8000-000000000101",
        side: "front", label: "X", x_in: 0, y_in: 0, width_in: 1, height_in: 1,
      }),
    });
    expect(res.ok).toBe(false);
  });

  test("cannot write to editions", async () => {
    const res = await anon("editions?id=eq.00000000-0000-4000-8000-000000000102", {
      method: "PATCH",
      body: JSON.stringify({ status: "open" }),
      headers: { Prefer: "return=representation" },
    });
    // Either refused outright or matched no rows; the draft must stay hidden.
    if (res.ok) expect(await res.json()).toEqual([]);
    const draft = await (await anon("slot_availability?issue_month=eq.2027-02-01&select=slot_id")).json();
    expect(draft).toEqual([]);
  });

  test("cannot read bookings or booking_slots", async () => {
    for (const table of ["bookings", "booking_slots"]) {
      const res = await anon(`${table}?select=*`);
      expect(res.ok).toBe(false);
    }
  });

  test("slot_pairs lists only side-by-side units in the same row, side and size", async () => {
    const slots: { slot_id: string; side: string; x_in: number; y_in: number; width_in: number; height_in: number }[] =
      await (await anon("slot_availability?zone_slug=eq.central-westchester&select=slot_id,side,x_in,y_in,width_in,height_in")).json();
    const byId = new Map(slots.map((s) => [s.slot_id, s]));
    const pairs: { left_slot_id: string; right_slot_id: string; double_unit_price_cents: number }[] =
      await (await anon("slot_pairs?select=left_slot_id,right_slot_id,double_unit_price_cents")).json();

    expect(pairs).toHaveLength(8); // provisional grid: 4 rows x 1 pair, both sides
    for (const pair of pairs) {
      const l = byId.get(pair.left_slot_id)!;
      const r = byId.get(pair.right_slot_id)!;
      expect(r.side).toBe(l.side);
      expect(Number(r.y_in)).toBe(Number(l.y_in));
      expect(Number(r.height_in)).toBe(Number(l.height_in));
      expect(Number(r.x_in)).toBe(Number(l.x_in) + Number(l.width_in));
      expect(pair.double_unit_price_cents).toBe(90000);
    }
  });

  test("cannot call hold_slots", async () => {
    const res = await anon("rpc/hold_slots", {
      method: "POST",
      body: JSON.stringify({ p_slot_ids: [], p_token_hash: "0".repeat(64) }),
    });
    expect(res.ok).toBe(false);
  });

  test("is_admin() is not exposed over the API", async () => {
    const res = await anon("rpc/is_admin", { method: "POST", body: "{}" });
    expect(res.ok).toBe(false);
  });
});
