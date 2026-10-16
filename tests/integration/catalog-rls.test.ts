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
    const res = await anon("slot_availability?zone_slug=eq.southern-westchester&select=*");
    expect(res.status).toBe(200);
    const rows: Record<string, unknown>[] = await res.json();

    expect(rows).toHaveLength(15); // placeholder seed: 7 front + 8 back
    expect(new Set(rows.map((r) => r.issue_month))).toEqual(new Set(["2027-01-01"]));
    expect(Object.keys(rows[0]).sort()).toEqual(
      [
        "artwork_deadline", "available", "edition_id", "height_in", "issue_month", "label",
        "price_cents", "side", "slot_id", "width_in", "x_in", "y_in", "zone_name", "zone_slug",
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
    expect(slots).toHaveLength(15);
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
        side: "front", label: "X", x_in: 0, y_in: 0, width_in: 1, height_in: 1, price_cents: 1,
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

  test("is_admin() is not exposed over the API", async () => {
    const res = await anon("rpc/is_admin", { method: "POST", body: "{}" });
    expect(res.ok).toBe(false);
  });
});
