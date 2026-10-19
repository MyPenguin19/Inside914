import { randomUUID, createHash } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { localLayoutFixture } from "../tests/integration/local-layout-fixture";
const db = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);
const layout = `test-approved-${randomUUID()}`,
  zone = randomUUID(),
  edition = randomUUID(),
  email = `account-${randomUUID()}@example.com`,
  password = `Local-${randomUUID()}!`;
let booking: string;
const future = randomUUID();
let planId: string;
const users: string[] = [];
async function fits(page: Page, label: string) {
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      `${label} ${width}px`,
    ).toBeLessThanOrEqual(0);
  }
}
test.beforeAll(async () => {
  localLayoutFixture(layout);
  expect(
    (
      await db.from("zones").insert({
        id: zone,
        name: "Account test area",
        slug: `account-${zone}`,
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
        artwork_due_at: "2097-12-20T23:59:00Z",
        unit_price_cents: 50000,
        double_unit_price_cents: 90000,
        layout_template: layout,
      })
    ).error,
  ).toBeNull();
  const { data: s } = await db
    .from("slots")
    .insert({
      edition_id: edition,
      side: "front",
      label: "F1",
      x_in: 0,
      y_in: 0,
      width_in: 3.25,
      height_in: 3,
    })
    .select("id")
    .single();
  const hold = await db
    .rpc("hold_slots", {
      p_slot_ids: [s!.id],
      p_token_hash: createHash("sha256").update(randomUUID()).digest("hex"),
      p_pricing_mode: "test",
      p_unit_price_cents: 100,
      p_double_price_cents: 200,
    })
    .single();
  expect(hold.error).toBeNull();
  booking = hold.data!.booking_id;
  expect(
    (
      await db.from("booking_contacts").insert({
        booking_id: booking,
        business_name: "Account browser test",
        contact_name: "Local Advertiser",
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
          reference: `IN914-${randomUUID().replace(/[01-]/g, "A").slice(0, 6).toUpperCase()}`,
          stripe_customer_id: "cus_devtest_account",
          stripe_payment_method_id: "pm_devtest_account",
          confirmed_at: new Date().toISOString(),
          hold_expires_at: null,
        })
        .eq("id", booking)
    ).error,
  ).toBeNull();
});

test.beforeAll(async () => {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(error).toBeNull();
  users.push(data.user!.id);
  await db
    .from("advertiser_email_verifications")
    .insert({ user_id: data.user!.id, verified_email: email });
  expect(
    (
      await db
        .from("editions")
        .insert({
          id: future,
          zone_id: zone,
          issue_month: "2098-02-01",
          status: "open",
          artwork_deadline: "2097-12-15T23:59:00Z",
          unit_price_cents: 60000,
          double_unit_price_cents: 100000,
          layout_template: layout,
        })
    ).error,
  ).toBeNull();
  expect(
    (
      await db
        .from("slots")
        .insert({
          edition_id: future,
          side: "front",
          label: "F1",
          x_in: 0,
          y_in: 0,
          width_in: 3.25,
          height_in: 3,
        })
    ).error,
  ).toBeNull();
});
test.afterAll(async () => {
  const { data: occ } = await db
    .from("recurring_occurrences")
    .select("cart_id")
    .eq("plan_id", planId ?? randomUUID());
  await db.from("recurring_plans").delete().eq("user_id", users[0]);
  const { data: bs } = await db
    .from("bookings")
    .select("id,booking_artwork(storage_path)")
    .in("edition_id", [edition, future]);
  const paths = (bs ?? []).flatMap((b) =>
    b.booking_artwork ? [b.booking_artwork.storage_path] : [],
  );
  if (paths.length) await db.storage.from("artwork").remove(paths);
  await db.from("bookings").delete().in("edition_id", [edition, future]);
  if (occ?.length)
    await db
      .from("reservation_carts")
      .delete()
      .in(
        "id",
        occ.map((o) => o.cart_id),
      );
  await db.from("editions").delete().in("id", [edition, future]);
  await db.from("zones").delete().eq("id", zone);
  for (const id of users) await db.auth.admin.deleteUser(id);
  localLayoutFixture(layout, true);
});
test("save, pause, resume and review a recurring plan, then complete one fresh checkout", async ({
  page,
}) => {
  test.setTimeout(120000);
  test.skip(
    process.env.INSIDE914_DEV_TEST_RESERVATIONS !== "true",
    "requires isolated simulated checkout",
  );
  await page.goto("/account/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page
    .getByRole("link", { name: "Recurring advertisements", exact: true })
    .click();
  await fits(page, "recurring plans");
  await page.getByLabel("Plan name").fill("Monthly local advertising");
  await page.getByRole("checkbox").check();
  await page.getByLabel("First repeat month").fill("2098-02");
  await page.getByLabel("Last repeat month").fill("2098-04");
  await page.getByRole("button", { name: "Save recurring plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Monthly local advertising" }),
  ).toBeVisible();
  planId = new URL(page.url()).pathname.split("/").at(-1)!;
  await fits(page, "recurring schedule");
  await page.getByRole("button", { name: "Pause plan" }).click();
  await expect(page.getByText("paused", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Review February 2098", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Resume plan" }).click();
  await page
    .getByRole("link", { name: "Review March 2098", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "no single open campaign",
  );
  await page
    .getByRole("link", { name: "Review February 2098", exact: true })
    .click();
  await expect(page.getByText("Total for this occurrence: $1")).toBeVisible();
  await fits(page, "recurrence review");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Continue to artwork and checkout" })
    .click();
  await expect(page).toHaveURL(/\/book\/cart$/);
  await page.goto(`/dashboard/recurring/${planId}`);
  await page
    .getByRole("button", { name: "Continue existing checkout" })
    .click();
  await expect(page).toHaveURL(/\/book\/cart$/);
  await page
    .getByRole("button", { name: "Edit artwork for Account test area" })
    .click();
  const image = await sharp({
    create: { width: 1200, height: 1200, channels: 3, background: "green" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Ad image file")
    .setInputFiles({
      name: "repeat.png",
      mimeType: "image/png",
      buffer: image,
    });
  await expect(page.getByText(/Image uploaded/)).toBeVisible({
    timeout: 15000,
  });
  await page
    .getByRole("button", { name: "Save artwork and return to areas" })
    .click();
  await page.getByLabel("Business name").fill("Repeat browser business");
  await page.getByLabel("Your name").fill("Local Owner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Phone").fill("9145550123");
  await page
    .getByRole("button", { name: "Continue to payment details" })
    .click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: /Simulate card and create TEST reservation/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your areas are reserved" }),
  ).toBeVisible({ timeout: 20000 });
  await page.goto(`/dashboard/recurring/${planId}`);
  await expect(
    page.getByText("Reservation created; manage each area in your dashboard."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Review February 2098", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel recurring plan" }).click();
  await expect(page.getByText("cancelled", { exact: true })).toBeVisible();
  expect(
    (await db.from("bookings").select("status").eq("edition_id", future)).data,
  ).toEqual([{ status: "reserved" }]);
});
