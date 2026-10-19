import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  beforeAll,
  afterAll,
  afterEach,
  test,
  describe,
  expect,
  vi,
} from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { localLayoutFixture } from "./local-layout-fixture";
import { makeImage } from "../fixtures/images";
vi.mock("server-only", () => ({}));
const { newReference } = await import("@/lib/checkout/service");
const { createCart } = await import("@/lib/booking/cart");
const { beginDraft, finalizeDraft } = await import("@/lib/advertiser/artwork");
const layout = `test-approved-${randomUUID()}`;
let db: SupabaseClient<Database>;
let alice: SupabaseClient<Database>;
let bob: SupabaseClient<Database>;
const email = `advertiser-${randomUUID()}@example.com`,
  password = `Local-${randomUUID()}!`;
const users: string[] = [];
const zones: string[] = [];
const editions: string[] = [];
const slots: string[] = [];
const cartIds: string[] = [];
let aliceId: string;
let bobId: string;
async function reservation() {
  const c = await createCart(
    db,
    editions.map((editionId, i) => ({
      editionId,
      slotIds: [slots[i]],
      mode: "standard",
    })),
  );
  cartIds.push(c.id);
  const { data: bookings } = await db
    .from("bookings")
    .select("id")
    .eq("cart_id", c.id);
  for (const b of bookings!) {
    expect(
      (
        await db
          .from("booking_contacts")
          .insert({
            booking_id: b.id,
            business_name: "Advertiser test",
            contact_name: "Test Owner",
            email,
            phone: "+19145550123",
          })
      ).error,
    ).toBeNull();
    expect(
      (
        await db
          .from("bookings")
          .update({
            status: "reserved",
            stripe_customer_id: "cus_devtest_advertiser",
            stripe_payment_method_id: "pm_devtest_advertiser",
            reference: newReference(),
            confirmed_at: new Date().toISOString(),
            hold_expires_at: null,
          })
          .eq("id", b.id)
      ).error,
    ).toBeNull();
  }
  return bookings!.map((b) => b.id);
}
async function proof() {
  expect(
    (
      await db
        .from("advertiser_email_verifications")
        .upsert({ user_id: aliceId, verified_email: email })
    ).error,
  ).toBeNull();
}
async function upload(id: string) {
  const d = await beginDraft(db, aliceId, id, { byteSize: 1000 });
  const bytes = await makeImage("png", 1000, 1000);
  const { data: row } = await db
    .from("advertiser_artwork_drafts")
    .select("storage_path")
    .eq("id", d.artworkId)
    .single();
  expect(
    (
      await db.storage
        .from("artwork")
        .upload(row!.storage_path, bytes, { contentType: "image/png" })
    ).error,
  ).toBeNull();
  expect(
    (await finalizeDraft(db, aliceId, id, { artworkId: d.artworkId })).ok,
  ).toBe(true);
  return d.artworkId;
}
const crop = (draft_id: string) => ({
  draft_id,
  x: 0,
  y: 0,
  width: 900,
  height: 900,
  zoom: 1,
});
describe("verified advertiser ownership and reservation management", () => {
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
    }
    [aliceId, bobId] = users;
    alice = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    bob = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    expect(
      (await alice.auth.signInWithPassword({ email, password })).error,
    ).toBeNull();
    expect(
      (await bob.auth.signInWithPassword({ email: `other-${email}`, password }))
        .error,
    ).toBeNull();
    await db
      .from("advertiser_email_verifications")
      .insert({ user_id: bobId, verified_email: `other-${email}` });
    for (let i = 0; i < 2; i++) {
      const zone = randomUUID(),
        edition = randomUUID(),
        slot = randomUUID();
      zones.push(zone);
      editions.push(edition);
      slots.push(slot);
      expect(
        (
          await db
            .from("zones")
            .insert({
              id: zone,
              name: `Advertiser ${zone}`,
              slug: `advertiser-${zone}`,
              household_count: 0,
            })
        ).error,
      ).toBeNull();
      expect(
        (
          await db
            .from("editions")
            .insert({
              id: edition,
              zone_id: zone,
              issue_month: "2098-01-01",
              status: "open",
              artwork_deadline: "2097-12-15T23:59:00Z",
              artwork_due_at: "2097-12-20T23:59:00Z",
              unit_price_cents: 50000,
              double_unit_price_cents: 90000,
              layout_template: layout,
            })
        ).error,
      ).toBeNull();
      expect(
        (
          await db
            .from("slots")
            .insert({
              id: slot,
              edition_id: edition,
              side: "front",
              label: "F1",
              x_in: 0,
              y_in: 0,
              width_in: 3.25,
              height_in: 3,
            })
        ).error,
      ).toBeNull();
    }
  });
  afterEach(async () => {
    const { data: bookings } = await db
      .from("bookings")
      .select("id")
      .in("edition_id", editions);
    if (bookings?.length) {
      const ids = bookings.map((b) => b.id);
      const { data: drafts } = await db
        .from("advertiser_artwork_drafts")
        .select("storage_path")
        .in("booking_id", ids);
      if (drafts?.length)
        await db.storage
          .from("artwork")
          .remove(drafts.map((d) => d.storage_path));
      await db.from("bookings").delete().in("id", ids);
    }
    if (cartIds.length)
      await db.from("reservation_carts").delete().in("id", cartIds);
    await db
      .from("advertiser_email_verifications")
      .delete()
      .eq("user_id", aliceId);
  });
  afterAll(async () => {
    await db.from("editions").delete().in("id", editions);
    await db.from("zones").delete().in("id", zones);
    for (const id of users) await db.auth.admin.deleteUser(id);
    localLayoutFixture(layout, true);
  });
  test("password session alone cannot claim; verified mailbox links all matching areas", async () => {
    await reservation();
    expect((await alice.rpc("claim_advertiser_bookings")).error).not.toBeNull();
    await proof();
    expect((await alice.rpc("claim_advertiser_bookings")).data).toBe(2);
    expect((await alice.rpc("claim_advertiser_bookings")).data).toBe(0);
    expect(
      (await alice.from("advertiser_bookings").select("*")).data,
    ).toHaveLength(2);
    expect((await bob.rpc("claim_advertiser_bookings")).data).toBe(0);
    expect(
      (await bob.from("advertiser_bookings").select("*")).data,
    ).toHaveLength(0);
  });
  test("ownership, email proofs and private drafts cannot be forged", async () => {
    const [id] = await reservation();
    await proof();
    await alice.rpc("claim_advertiser_bookings");
    expect(
      (
        await bob
          .from("advertiser_bookings")
          .insert({ booking_id: id, user_id: bobId })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await bob
          .from("advertiser_email_verifications")
          .update({ verified_email: email })
          .eq("user_id", bobId)
      ).error,
    ).not.toBeNull();
    expect(
      (
        await bob.rpc("advertiser_manage", {
          p_booking: id,
          p_action: "cancel",
          p: {},
        })
      ).error,
    ).not.toBeNull();
    expect(
      (await bob.from("advertiser_artwork_drafts").select("*")).error,
    ).not.toBeNull();
    await expect(
      beginDraft(db, bobId, id, { byteSize: 1000 }),
    ).rejects.toThrow();
  });
  test("business details change without changing ownership, receipt email or price", async () => {
    const [id] = await reservation();
    await proof();
    await alice.rpc("claim_advertiser_bookings");
    expect(
      (
        await alice.rpc("advertiser_manage", {
          p_booking: id,
          p_action: "contact",
          p: {
            business_name: "Updated company",
            contact_name: "Owner",
            phone: "+19145550124",
            website: "https://example.com",
            category: "",
            email: "attacker@example.com",
            price_cents: 1,
          },
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await db
          .from("booking_contacts")
          .select("business_name,email")
          .eq("booking_id", id)
          .single()
      ).data,
    ).toEqual({ business_name: "Updated company", email });
    expect(
      (await db.from("bookings").select("price_cents").eq("id", id).single())
        .data?.price_cents,
    ).toBe(100);
  });
  test("staged artwork is validated, private and applied atomically with fresh review", async () => {
    const [id] = await reservation();
    await proof();
    await alice.rpc("claim_advertiser_bookings");
    const draft = await upload(id);
    expect(
      (await db.from("booking_artwork").select("id").eq("booking_id", id)).data,
    ).toHaveLength(0);
    expect(
      (
        await bob.rpc("advertiser_manage", {
          p_booking: id,
          p_action: "artwork",
          p: crop(draft),
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await alice.rpc("advertiser_manage", {
          p_booking: id,
          p_action: "artwork",
          p: { ...crop(draft), width: 5000 },
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await alice.rpc("advertiser_manage", {
          p_booking: id,
          p_action: "artwork",
          p: crop(draft),
        })
      ).error,
    ).toBeNull();
    const { data: old } = await db
      .from("booking_artwork")
      .select("storage_path")
      .eq("booking_id", id)
      .single();
    await db
      .from("booking_artwork")
      .update({ review_status: "approved" })
      .eq("booking_id", id);
    const next = await upload(id);
    expect(
      (
        await db
          .from("booking_artwork")
          .select("storage_path")
          .eq("booking_id", id)
          .single()
      ).data?.storage_path,
    ).toBe(old!.storage_path);
    expect(
      (
        await alice.rpc("advertiser_manage", {
          p_booking: id,
          p_action: "artwork",
          p: crop(next),
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await db
          .from("booking_artwork")
          .select("review_status")
          .eq("booking_id", id)
          .single()
      ).data?.review_status,
    ).toBe("pending");
  });
  test("stale revisions and edits after payment or deadline are rejected", async () => {
    const [id] = await reservation();
    await proof();
    await alice.rpc("claim_advertiser_bookings");
    const a = await upload(id),
      b = await upload(id);
    expect(
      (
        await alice.rpc("advertiser_manage", {
          p_booking: id,
          p_action: "artwork",
          p: crop(a),
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await alice.rpc("advertiser_manage", {
          p_booking: id,
          p_action: "artwork",
          p: crop(b),
        })
      ).error,
    ).not.toBeNull();
    await db.from("bookings").update({ status: "charged" }).eq("id", id);
    expect(
      (
        await alice.rpc("advertiser_manage", {
          p_booking: id,
          p_action: "cancel",
          p: {},
        })
      ).error,
    ).not.toBeNull();
    await db.from("bookings").update({ status: "reserved" }).eq("id", id);
    await db
      .from("editions")
      .update({ artwork_due_at: "2020-01-01T00:00:00Z" })
      .in("id", editions);
    try {
      await expect(
        beginDraft(db, aliceId, id, { byteSize: 1000 }),
      ).rejects.toThrow();
      expect(
        (
          await alice.rpc("advertiser_manage", {
            p_booking: id,
            p_action: "artwork",
            p: crop(b),
          })
        ).error,
      ).not.toBeNull();
    } finally {
      await db
        .from("editions")
        .update({ artwork_due_at: "2097-12-20T23:59:00Z" })
        .in("id", editions);
    }
  });
  test("canceling one area releases only its inventory and queues a notice", async () => {
    const [id, other] = await reservation();
    await proof();
    await alice.rpc("claim_advertiser_bookings");
    expect(
      (
        await alice.rpc("advertiser_manage", {
          p_booking: id,
          p_action: "cancel",
          p: {},
        })
      ).error,
    ).toBeNull();
    expect(
      (await db.from("bookings").select("status").eq("id", id).single()).data
        ?.status,
    ).toBe("cancelled");
    expect(
      (await db.from("bookings").select("status").eq("id", other).single()).data
        ?.status,
    ).toBe("reserved");
    expect(
      (
        await db
          .from("booking_slots")
          .select("slot_id")
          .eq("booking_id", id)
          .is("released_at", null)
      ).data,
    ).toHaveLength(0);
    expect(
      (await db.from("email_outbox").select("kind").eq("booking_id", id)).data,
    ).toContainEqual({ kind: "reservation_cancelled" });
  });
});
