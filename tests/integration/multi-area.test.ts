import { deleteLocalCampaignFixtures } from "./local-layout-fixture";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  test,
  expect,
  vi,
} from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import type { StripeClient } from "@/lib/checkout/stripe";
import { localLayoutFixture } from "./local-layout-fixture";
import { makeImage } from "../fixtures/images";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/outbox", () => ({
  processOutboxForBooking: vi.fn(async () => {}),
}));
const {
  cartMemberToken,
  copyCartArtwork,
  createCart,
  ownedCart,
  startCartPayment,
  completeCart,
  CART_TERMS,
} = await import("@/lib/booking/cart");
const { placeHold } = await import("@/lib/booking/place-hold");
const { fakeStripe } = await import("@/lib/dev/fake-stripe");
const { removeSavedCard } = await import("@/lib/checkout/card-removal");
const layout = `test-approved-${randomUUID()}`;
let db: SupabaseClient<Database>;
const zones: string[] = [];
const editions: string[] = [];
const slots: string[][] = [];
const carts: string[] = [];
const choices = () =>
  editions.map((editionId, i) => ({
    editionId,
    slotIds: [slots[i][0]],
    mode: "standard" as const,
  }));
async function held() {
  const c = await createCart(db, choices());
  carts.push(c.id);
  return { ...c, cart: (await ownedCart(db, c.token))! };
}
async function ready() {
  const c = await held();
  for (const b of c.cart.members) {
    const path = `${b.id}/${randomUUID()}`;
    expect(
      (
        await db.storage
          .from("artwork")
          .upload(path, await makeImage("png", 1000, 1000), {
            contentType: "image/png",
          })
      ).error,
    ).toBeNull();
    expect(
      (
        await db.from("booking_artwork").insert({
          booking_id: b.id,
          storage_path: path,
          status: "ready",
          content_type: "image/png",
          width_px: 1000,
          height_px: 1000,
          byte_size: 10000,
          crop_x: 0,
          crop_y: 0,
          crop_width: 1000,
          crop_height: 1000,
          zoom: 1,
        })
      ).error,
    ).toBeNull();
  }
  expect(
    (
      await db.from("booking_contacts").insert(
        c.cart.members.map((b) => ({
          booking_id: b.id,
          business_name: "Local test",
          contact_name: "Test",
          email: "local@example.com",
          phone: "+19145550123",
        })),
      )
    ).error,
  ).toBeNull();
  const payment = await startCartPayment(
    db,
    fakeStripe as unknown as StripeClient,
    c.token,
  );
  expect(payment.ok).toBe(true);
  const updated = (await ownedCart(db, c.token))!;
  const leader = updated.members.find((b) => b.stripeSetupIntentId)!;
  expect(
    (
      await db.from("payment_consents").insert(
        updated.members.map((b) => ({
          booking_id: b.id,
          edition_id: b.editionId,
          stripe_setup_intent_id: leader.stripeSetupIntentId!,
          amount_cents: b.priceCents,
          pricing_mode: b.pricingMode,
          terms_version: CART_TERMS,
        })),
      )
    ).error,
  ).toBeNull();
  fakeStripe.simulateSuccess(leader.stripeSetupIntentId!);
  return { ...c, cart: updated, leader };
}
describe("multi-area groups, isolated local campaigns", () => {
  test("copying stages an independent original until the destination is explicitly saved", async () => {
    const c = await ready();
    const [source, target] = c.cart.members;
    const previous = "2020-01-01T00:00:00Z";
    const old = await db.from("booking_artwork").select("storage_path").eq("booking_id", target.id).single();
    expect((await db.from("booking_artwork").update({ shared_source_id: randomUUID(), updated_at: previous }).eq("booking_id", target.id)).error).toBeNull();
    const uploadId = await copyCartArtwork(db, c.token, source.id, target.id);
    // Copy is staged: the target keeps its current original until explicitly saved.
    expect((await db.from("booking_artwork").select("storage_path").eq("booking_id",target.id).single()).data?.storage_path).toBe(old.data!.storage_path);
    const {saveLayout} = await import("@/lib/artwork/service");
    expect(await saveLayout(db,cartMemberToken(c.token,target.editionId),{artworkId:uploadId,crop:{x:0,y:0,width:1000,height:1000},zoom:1})).toEqual({ok:true});
    const { data } = await db.from("booking_artwork").select("*").eq("booking_id", target.id).single();
    expect(data).toMatchObject({ shared_source_id: null, crop_x: 0, crop_width: 1000, review_status: "pending" });
    expect(Date.parse(data!.updated_at)).toBeGreaterThan(Date.parse(previous));
    expect(data!.storage_path).not.toBe(old.data!.storage_path);
    expect((await db.storage.from("artwork").download(data!.storage_path)).error).toBeNull();
  });

  beforeAll(async () => {
    db = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false } },
    );
    localLayoutFixture(layout);
    for (let i = 0; i < 4; i++) {
      const zone = randomUUID(),
        edition = randomUUID();
      zones.push(zone);
      editions.push(edition);
      expect(
        (
          await db.from("zones").insert({
            id: zone,
            name: `Multi ${zone}`,
            slug: `multi-${zone}`,
            household_count: 0,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await db.from("editions").insert({
            id: edition,
            zone_id: zone,
            issue_month: "2098-01-01",
            status: "open",
            artwork_deadline: "2097-12-15T23:59:00Z",
            unit_price_cents: 39900,
            double_unit_price_cents: null,
            layout_template: layout,
          })
        ).error,
      ).toBeNull();
      const rows = ["front", "back"].flatMap((side) =>
        Array.from({ length: 8 }, (_, n) => ({
          id: randomUUID(),
          edition_id: edition,
          side,
          label: `${side === "front" ? "F" : "B"}${n + 1}`,
          x_in: (n % 2) * 3.25,
          y_in: Math.floor(n / 2) * 3,
          width_in: 3.25,
          height_in: 3,
        })),
      );
      expect((await db.from("slots").insert(rows)).error).toBeNull();
      slots.push(rows.map((r) => r.id));
    }
  });
  afterEach(async () => {
    const { data: bookings } = await db
      .from("bookings")
      .select("id,cart_id")
      .in("edition_id", editions);
    if (bookings?.length) {
      const { data: art } = await db
        .from("booking_artwork")
        .select("storage_path")
        .in(
          "booking_id",
          bookings.map((b) => b.id),
        );
      if (art?.length)
        await db.storage.from("artwork").remove(art.map((a) => a.storage_path));
      expect(
        (await db.from("bookings").delete().in("edition_id", editions)).error,
      ).toBeNull();
      for (const b of bookings) if (b.cart_id) carts.push(b.cart_id);
    }
    if (carts.length)
      await db.from("reservation_carts").delete().in("id", carts);
  });
  afterAll(async () => {
    deleteLocalCampaignFixtures(editions);
    await db.from("zones").delete().in("id", zones);
    localLayoutFixture(layout, true);
  });
  test("one, two and three areas work without requiring four", async () => {
    for (let count = 1; count <= 3; count++) {
      const input = choices()
        .slice(0, count)
        .map((item, i) => ({ ...item, slotIds: [slots[i][count]] }));
      const c = await createCart(db, input);
      carts.push(c.id);
      expect((await ownedCart(db, c.token))!.members).toHaveLength(count);
    }
  });
  test("draft campaigns reject the entire group", async () => {
    await db.from("editions").update({ status: "draft" }).eq("id", editions[3]);
    try {
      await expect(createCart(db, choices())).rejects.toThrow();
    } finally {
      await db
        .from("editions")
        .update({ status: "open" })
        .eq("id", editions[3]);
    }
    expect(
      (await db.from("bookings").select("id").in("edition_id", editions)).data,
    ).toHaveLength(0);
  });
  test("the verified webhook confirms all areas and ignores duplicate delivery", async () => {
    const c = await ready();
    const { handleStripeEvent } = await import("@/lib/checkout/webhook");
    const event = {
      id: `evt_multi_${randomUUID()}`,
      type: "setup_intent.succeeded",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: await fakeStripe.setupIntents.retrieve(
          c.leader.stripeSetupIntentId!,
        ),
      },
    };
    try {
      expect(
        await handleStripeEvent(
          db,
          fakeStripe as unknown as StripeClient,
          event as import("stripe").default.Event,
        ),
      ).toBe("handled");
      expect(
        await handleStripeEvent(
          db,
          fakeStripe as unknown as StripeClient,
          event as import("stripe").default.Event,
        ),
      ).toBe("duplicate");
      expect(
        (await ownedCart(db, c.token))!.members.every(
          (b) => b.status === "reserved",
        ),
      ).toBe(true);
    } finally {
      await db.from("stripe_events").delete().eq("id", event.id);
    }
  });
  test("four unique areas, private tokens, server prices and input limits", async () => {
    process.env.INSIDE914_PRICING_MODE = "launch";
    try {
      const c = await held();
      expect(c.cart.members).toHaveLength(4);
      expect(c.cart.members.reduce((n, b) => n + b.priceCents, 0)).toBe(159600);
      expect(await ownedCart(db, "wrong-token")).toBeNull();
    } finally {
      process.env.INSIDE914_PRICING_MODE = "test";
    }
    await expect(createCart(db, [])).rejects.toThrow();
    await expect(
      createCart(db, [...choices(), choices()[0]]),
    ).rejects.toThrow();
    const anon = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
    );
    expect(
      (await anon.from("reservation_carts").select("*")).error,
    ).not.toBeNull();
    expect(
      (
        await anon.rpc("hold_cart", {
          p_token_hash: "x",
          p_items: [],
          p_pricing_mode: "test",
        })
      ).error,
    ).not.toBeNull();
  });
  test("duplicate areas and cross-edition slots roll back completely", async () => {
    await expect(
      createCart(db, [
        choices()[0],
        { ...choices()[0], slotIds: [slots[0][1]] },
      ]),
    ).rejects.toThrow();
    await expect(
      createCart(db, [
        choices()[0],
        { ...choices()[1], slotIds: [slots[2][0]] },
      ]),
    ).rejects.toThrow();
    expect(
      (await db.from("bookings").select("id").in("edition_id", editions)).data,
    ).toHaveLength(0);
  });

  test("racing groups have exactly one winner; losing group leaves no partial inventory", async () => {
    const results = await Promise.allSettled([
      createCart(db, choices()),
      createCart(db, [...choices()].reverse()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await db.from("bookings").select("id").in("edition_id", editions)).data,
    ).toHaveLength(4);
  });
  test("a conflicting standalone hold prevents all group holds", async () => {
    expect((await placeHold(db, { slotIds: [slots[3][0]] })).ok).toBe(true);
    await expect(createCart(db, choices())).rejects.toThrow();
    expect(
      (await db.from("bookings").select("id").in("edition_id", editions)).data,
    ).toHaveLength(1);
  });
  test("one setup saves card for four atomic confirmations and is idempotent", async () => {
    const c = await ready();
    expect(
      (
        await db.rpc("confirm_booking", {
          p_booking_id: c.leader.id,
          p_setup_intent_id: c.leader.stripeSetupIntentId!,
          p_payment_method_id: "pm_wrong",
          p_reference: "IN914-BYPASS",
        })
      ).data,
    ).toBe("not_pending");
    const outcomes = await Promise.all([
      completeCart(db, fakeStripe as unknown as StripeClient, c.id),
      completeCart(db, fakeStripe as unknown as StripeClient, c.id),
    ]);
    expect(outcomes.sort()).toEqual(["already_confirmed", "confirmed"]);
    const { data } = await db
      .from("bookings")
      .select(
        "status,reference,stripe_payment_method_id,stripe_setup_intent_id",
      )
      .eq("cart_id", c.id);
    expect(data!.every((b) => b.status === "reserved")).toBe(true);
    expect(new Set(data!.map((b) => b.reference)).size).toBe(4);
    expect(new Set(data!.map((b) => b.stripe_payment_method_id)).size).toBe(1);
    expect(data!.filter((b) => b.stripe_setup_intent_id)).toHaveLength(1);
    expect(
      (
        await db
          .from("booking_artwork")
          .update({ crop_width: 1 })
          .eq("booking_id", c.leader.id)
      ).error,
    ).not.toBeNull();
    const cancelled = c.cart.members[0];
    await db
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", cancelled.id);
    expect(
      await removeSavedCard(
        db,
        fakeStripe as unknown as StripeClient,
        cancelled.id,
      ),
    ).toBe("skipped");
    await db
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("cart_id", c.id);
    expect(
      await removeSavedCard(
        db,
        fakeStripe as unknown as StripeClient,
        cancelled.id,
      ),
    ).toBe("removed");
  });
  test("one missing consent or expired area prevents every confirmation", async () => {
    const c = await ready();
    await db
      .from("payment_consents")
      .delete()
      .eq("booking_id", c.cart.members[1].id);
    expect(
      await completeCart(db, fakeStripe as unknown as StripeClient, c.id),
    ).toBe("consent_missing");
    await db
      .from("bookings")
      .update({ hold_expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("cart_id", c.id);
    expect(
      await completeCart(db, fakeStripe as unknown as StripeClient, c.id),
    ).toBe("hold_expired");
    expect(
      (
        await db.from("bookings").select("status").eq("cart_id", c.id)
      ).data!.every((b) => b.status === "released"),
    ).toBe(true);
  });

});
