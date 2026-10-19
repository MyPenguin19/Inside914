import { randomUUID, createHash } from "node:crypto";
import { beforeAll, afterAll, test, expect, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { localLayoutFixture } from "./local-layout-fixture";
import { makeImage } from "../fixtures/images";
vi.mock("server-only", () => ({}));
const { createCart } = await import("@/lib/booking/cart");
const { reviewOccurrence, beginOccurrence } =
  await import("@/lib/recurring/service");
const { newReference } = await import("@/lib/checkout/service");
let db: SupabaseClient<Database>,
  owner: SupabaseClient<Database>,
  other: SupabaseClient<Database>;
const layout = `test-approved-${randomUUID()}`,
  email = `repeat-${randomUUID()}@example.com`,
  password = `Password-${randomUUID()}`;
const users: string[] = [],
  zones: string[] = [],
  editions: string[] = [],
  sources: string[] = [],
  sourceCarts: string[] = [];
const nextSlots: string[] = [];
let planId: string;
const p = {
  name: "Recurring tests",
  sources,
  start_month: "2098-02-01",
  end_month: "2098-05-01",
  interval_months: 1,
};
const hash = () => createHash("sha256").update(randomUUID()).digest("hex");
async function plan(input: Json = p) {
  return owner.rpc("recurring_plan_manage", {
    p_id: randomUUID(),
    p_action: "create",
    p: input,
  });
}
async function status(value: string) {
  return owner.rpc("recurring_plan_manage", {
    p_id: planId,
    p_action: value,
    p: {},
  });
}
async function args() {
  return {
    p_user: users[0],
    p_plan: planId,
    p_month: "2098-02-01",
    p_nonce: randomUUID(),
    p_hash: hash(),
    p_pricing_mode: "test",
    p_expected_total: 200,
    p_items: sources.map((source_id, i) => ({
      source_id,
      edition_id: editions[i * 2 + 1],
      slot_ids: [nextSlots[i]],
      mode: "standard",
      token_hash: hash(),
    })),
  };
}
beforeAll(async () => {
  db = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );
  localLayoutFixture(layout);
  for (const address of [email, `other-${email}`]) {
    const { data, error } = await db.auth.admin.createUser({
      email: address,
      password,
      email_confirm: true,
    });
    expect(error).toBeNull();
    users.push(data.user!.id);
    await db
      .from("advertiser_email_verifications")
      .insert({ user_id: data.user!.id, verified_email: address });
  }
  owner = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  other = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  await owner.auth.signInWithPassword({ email, password });
  await other.auth.signInWithPassword({ email: `other-${email}`, password });
  for (let i = 0; i < 2; i++) {
    const zone = randomUUID();
    zones.push(zone);
    expect(
      (
        await db
          .from("zones")
          .insert({
            id: zone,
            name: `Repeat ${zone}`,
            slug: `repeat-${zone}`,
            household_count: 0,
          })
      ).error,
    ).toBeNull();
    for (const month of ["2098-01-01", "2098-02-01"]) {
      const id = randomUUID();
      editions.push(id);
      expect(
        (
          await db
            .from("editions")
            .insert({
              id,
              zone_id: zone,
              issue_month: month,
              status: "open",
              artwork_deadline: "2097-12-15T23:59:00Z",
              unit_price_cents: 50000,
              double_unit_price_cents: 90000,
              layout_template: layout,
            })
        ).error,
      ).toBeNull();
      const slot = randomUUID();
      expect(
        (
          await db
            .from("slots")
            .insert({
              id: slot,
              edition_id: id,
              side: "front",
              label: "F1",
              x_in: 0,
              y_in: 0,
              width_in: 3.25,
              height_in: 3,
            })
        ).error,
      ).toBeNull();
      if (month === "2098-02-01") {
        nextSlots.push(slot);
        continue;
      }
      const cart = await createCart(db, [
        { editionId: id, slotIds: [slot], mode: "standard" },
      ]);
      sourceCarts.push(cart.id);
      const { data: b } = await db
        .from("bookings")
        .select("id")
        .eq("cart_id", cart.id)
        .single();
      sources.push(b!.id);
      const path = `${b!.id}/${randomUUID()}`;
      await db.storage
        .from("artwork")
        .upload(path, await makeImage("png", 1000, 1000), {
          contentType: "image/png",
        });
      expect(
        (
          await db
            .from("booking_artwork")
            .insert({
              booking_id: b!.id,
              storage_path: path,
              status: "ready",
              content_type: "image/png",
              byte_size: 1000,
              width_px: 1000,
              height_px: 1000,
              crop_x: 0,
              crop_y: 0,
              crop_width: 900,
              crop_height: 900,
              zoom: 1,
            })
        ).error,
      ).toBeNull();
      await db
        .from("booking_contacts")
        .insert({
          booking_id: b!.id,
          business_name: "Repeat business",
          contact_name: "Owner",
          email,
          phone: "+19145550123",
        });
      expect(
        (
          await db
            .from("bookings")
            .update({
              status: "reserved",
              reference: newReference(),
              confirmed_at: new Date().toISOString(),
              hold_expires_at: null,
              stripe_customer_id: "cus_devtest_repeat",
              stripe_payment_method_id: "pm_devtest_repeat",
            })
            .eq("id", b!.id)
        ).error,
      ).toBeNull();
    }
  }
  expect((await owner.rpc("claim_advertiser_bookings")).error).toBeNull();
});
afterAll(async () => {
  const { data: occ } = await db
    .from("recurring_occurrences")
    .select("cart_id")
    .eq("plan_id", planId ?? randomUUID());
  await db.from("recurring_plans").delete().eq("user_id", users[0]);
  const { data: bookings } = await db
    .from("bookings")
    .select("id,booking_artwork(storage_path)")
    .in("edition_id", editions);
  const paths = (bookings ?? []).flatMap((b) =>
    b.booking_artwork ? [b.booking_artwork.storage_path] : [],
  );
  if (paths.length) await db.storage.from("artwork").remove(paths);
  await db.from("bookings").delete().in("edition_id", editions);
  await db
    .from("reservation_carts")
    .delete()
    .in("id", [...sourceCarts, ...(occ ?? []).map((o) => o.cart_id)]);
  await db.from("editions").delete().in("id", editions);
  await db.from("zones").delete().in("id", zones);
  for (const id of users) await db.auth.admin.deleteUser(id);
  localLayoutFixture(layout, true);
});
test("verified owner creates a multi-area plan; duplicate and foreign source plans are rejected", async () => {
  expect(
    (
      await other.rpc("recurring_plan_manage", {
        p_id: randomUUID(),
        p_action: "create",
        p,
      })
    ).error,
  ).not.toBeNull();
  const result = await plan();
  expect(result.error).toBeNull();
  planId = result.data!;
  expect((await plan()).error?.code).toBe("23505");
  expect((await other.from("recurring_plans").select("*")).data).toEqual([]);
  expect(
    (
      await other.rpc("recurring_plan_manage", {
        p_id: planId,
        p_action: "paused",
        p: {},
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await owner
        .from("recurring_plans")
        .update({ status: "cancelled" })
        .eq("id", planId)
    ).error,
  ).not.toBeNull();
});
test("validates source month, cadence and end date in the database", async () => {
  for (const override of [
    { start_month: "2098-01-01" },
    { interval_months: 0 },
    { end_month: "2100-02-01" },
    { sources: [sources[0], sources[0]] },
  ])
    expect((await plan({ ...p, ...override })).error).not.toBeNull();
  const a = await args();
  expect(
    (await db.rpc("hold_recurring_occurrence", { ...a, p_month: "2098-06-01" }))
      .error,
  ).not.toBeNull();
  expect(
    (await owner.rpc("hold_recurring_occurrence", a)).error,
  ).not.toBeNull();
});
test("pause prevents new holds and resume restores review; missing campaigns are explicit", async () => {
  expect((await status("paused")).error).toBeNull();
  await expect(
    reviewOccurrence(db, users[0], planId, "2098-02-01"),
  ).rejects.toThrow("not active");
  expect(
    (await db.rpc("hold_recurring_occurrence", await args())).error,
  ).not.toBeNull();
  expect((await status("active")).error).toBeNull();
  await expect(
    reviewOccurrence(db, users[0], planId, "2098-03-01"),
  ).rejects.toThrow("no single open campaign");
  await expect(
    reviewOccurrence(db, users[1], planId, "2098-02-01"),
  ).rejects.toThrow("unavailable");
});
test("stale totals and one unavailable area cannot create partial holds", async () => {
  const a = await args();
  expect(
    (await db.rpc("hold_recurring_occurrence", { ...a, p_expected_total: 100 }))
      .error,
  ).not.toBeNull();
  expect(
    (await db.from("recurring_occurrences").select("*").eq("plan_id", planId))
      .data,
  ).toEqual([]);
  await db.from("editions").update({ status: "draft" }).eq("id", editions[3]);
  expect(
    (await db.rpc("hold_recurring_occurrence", await args())).error,
  ).not.toBeNull();
  expect(
    (
      await db
        .from("bookings")
        .select("id")
        .in("edition_id", [editions[1], editions[3]])
    ).data,
  ).toEqual([]);
  await db.from("editions").update({ status: "open" }).eq("id", editions[3]);
});
test("review uses current prices; artwork is independently copied without crop, approval, saved cards or consent", async () => {
  const review = await reviewOccurrence(db, users[0], planId, "2098-02-01");
  expect(review.total).toBe(200);
  await expect(
    beginOccurrence(db, users[0], planId, "2098-02-01", 100),
  ).rejects.toThrow("Pricing changed");
  const cart = await beginOccurrence(db, users[0], planId, "2098-02-01", 200);
  const { data: members } = await db
    .from("bookings")
    .select("*,booking_artwork(*)")
    .eq("cart_id", cart.id);
  expect(members).toHaveLength(2);
  for (const b of members!) {
    expect(b.status).toBe("pending");
    expect(b.stripe_payment_method_id).toBeNull();
    expect(b.booking_artwork?.crop_width).toBeNull();
    expect(b.booking_artwork?.review_status).toBe("pending");
    expect(b.booking_artwork?.storage_path.startsWith(b.id)).toBe(true);
    expect(
      (await db.from("payment_consents").select("id").eq("booking_id", b.id))
        .data,
    ).toEqual([]);
  }
  const original = (
    await db
      .from("booking_artwork")
      .select("storage_path,crop_width")
      .in("booking_id", sources)
  ).data!;
  expect(original.every((a) => a.crop_width === 900)).toBe(true);
});
test("repeat clicks reuse one occurrence; confirmed occurrence cannot be duplicated; cancel does not cancel bookings", async () => {
  const attempts = await Promise.all([
    db.rpc("hold_recurring_occurrence", await args()),
    db.rpc("hold_recurring_occurrence", await args()),
  ]);
  expect(attempts.every((a) => !a.error)).toBe(true);
  expect(attempts[0].data).toEqual(attempts[1].data);
  const { data: o } = await db
    .from("recurring_occurrences")
    .select("*")
    .eq("plan_id", planId)
    .single();
  const { data: bs } = await db
    .from("bookings")
    .select("id")
    .eq("cart_id", o!.cart_id);
  for (const b of bs!)
    await db
      .from("bookings")
      .update({
        status: "reserved",
        reference: newReference(),
        confirmed_at: new Date().toISOString(),
        hold_expires_at: null,
        stripe_customer_id: "cus_devtest_repeat_new",
        stripe_payment_method_id: "pm_devtest_repeat_new",
      })
      .eq("id", b.id);
  expect(
    (await db.rpc("hold_recurring_occurrence", await args())).error?.message,
  ).toContain("already reserved");
  expect((await status("cancelled")).error).toBeNull();
  expect((await status("active")).error).not.toBeNull();
  expect(
    (
      await db.from("bookings").select("status").eq("cart_id", o!.cart_id)
    ).data?.every((b) => b.status === "reserved"),
  ).toBe(true);
});
