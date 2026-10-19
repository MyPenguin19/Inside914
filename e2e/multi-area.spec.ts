import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { localLayoutFixture } from "../tests/integration/local-layout-fixture";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);
const layout = `test-approved-${randomUUID()}`;
const editions: string[] = [];
const names = [
  "Central Westchester",
  "Southern Westchester",
  "Northern Westchester",
  "Eastern Westchester",
];
test.beforeAll(async () => {
  localLayoutFixture(layout);
  const { data: zones } = await db
    .from("zones")
    .select("id,name")
    .in("name", names);
  for (const name of names) {
    const zone = zones!.find((z) => z.name === name)!;
    expect(zone).toBeTruthy();
    const id = randomUUID();
    editions.push(id);
    expect(
      (
        await db.from("editions").insert({
          id,
          zone_id: zone.id,
          issue_month: "2098-02-01",
          status: "open",
          artwork_deadline: "2098-01-15T23:59:00Z",
          unit_price_cents: 50000,
          double_unit_price_cents: 90000,
          layout_template: layout,
        })
      ).error,
    ).toBeNull();
    const slots = ["front", "back"].flatMap((side) =>
      Array.from({ length: 8 }, (_, n) => ({
        edition_id: id,
        side,
        label: `${side === "front" ? "F" : "B"}${n + 1}`,
        x_in: (n % 2) * 3.25,
        y_in: Math.floor(n / 2) * 3,
        width_in: 3.25,
        height_in: 3,
      })),
    );
    expect((await db.from("slots").insert(slots)).error).toBeNull();
  }
});
test.afterAll(async () => {
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
    await db.from("bookings").delete().in("edition_id", editions);
    await db
      .from("reservation_carts")
      .delete()
      .in("id", bookings.map((b) => b.cart_id).filter(Boolean));
  }
  await db.from("editions").delete().in("id", editions);
  localLayoutFixture(layout, true);
});
test("four areas with shared and different artwork complete one simulated checkout", async ({
  page,
}) => {
  test.skip(
    process.env.INSIDE914_DEV_TEST_RESERVATIONS !== "true",
    "requires isolated simulated checkout",
  );
  test.setTimeout(150000);
  await page.goto("/book/multi", { waitUntil: "networkidle" });
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      `picker at ${width}`,
    ).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 375, height: 900 });
  for (const id of editions) {
    await page.getByLabel("Area and campaign").selectOption(id);
    await page
      .getByRole("button", { name: /^Front position F1: Available/ })
      .click();
    await page
      .getByRole("button", { name: "Add this area to selection" })
      .click();
  }
  await expect(
    page.getByRole("heading", { name: "Selected areas (4/4)" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Hold selected areas (15 min)" })
    .click();
  await expect(page).toHaveURL(/\/book\/cart$/);
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole("button", { name: `Edit artwork for ${names[i]}` })
      .click();
    await expect(page).toHaveURL(/\/book\/artwork$/);
    await expect(page.getByTestId("artwork-area")).toHaveText(names[i]);
    const image = await sharp({
      create: {
        width: 1200,
        height: 1200,
        channels: 3,
        background: i === 0 ? "green" : "blue",
      },
    })
      .png()
      .toBuffer();
    await page.getByLabel("Ad image file").setInputFiles({
      name: `area-${i}.png`,
      mimeType: "image/png",
      buffer: image,
    });
    await expect(page.getByText(/Image uploaded/)).toBeVisible({
      timeout: 20000,
    });
    await page
      .getByRole("button", { name: "Save artwork and return to areas" })
      .click();
    await expect(page).toHaveURL(/\/book\/cart$/);
  }
  for (let i = 2; i < 4; i++) {
    const section = page
      .locator("section")
      .filter({
        has: page.getByRole("button", { name: `Edit artwork for ${names[i]}` }),
      })
      .last();
    await section.getByRole("combobox").selectOption({ label: names[0] });
    await section
      .getByRole("button", { name: "Copy image and position for this area" })
      .click();
    await expect(page).toHaveURL(/\/book\/artwork$/);
    await expect(page.getByTestId("artwork-area")).toHaveText(names[i]);
    await page
      .getByRole("button", { name: "Save artwork and return to areas" })
      .click();
    await expect(page).toHaveURL(/\/book\/cart$/);
  }
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      `cart at ${width}`,
    ).toBeLessThanOrEqual(0);
  }
  await page.getByLabel("Business name").fill("Multi-area local test");
  await page.getByLabel("Your name").fill("Local Test");
  await page.getByLabel("Email").fill("local-multi@example.com");
  await page.getByLabel("Phone").fill("9145550123");
  await page
    .getByRole("button", { name: "Continue to payment details" })
    .click();
  await expect(page).toHaveURL(/\/book\/cart\/payment$/);
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      `payment at ${width}`,
    ).toBeLessThanOrEqual(0);
  }
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: /Simulate card and create TEST reservation/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your areas are reserved" }),
  ).toBeVisible({ timeout: 20000 });
  const { data: bookings } = await db
    .from("bookings")
    .select("id,status,cart_id,stripe_setup_intent_id")
    .in("edition_id", editions);
  expect(bookings).toHaveLength(4);
  expect(bookings!.every((b) => b.status === "reserved")).toBe(true);
  expect(new Set(bookings!.map((b) => b.cart_id)).size).toBe(1);
  expect(bookings!.filter((b) => b.stripe_setup_intent_id)).toHaveLength(1);
  const { data: art } = await db
    .from("booking_artwork")
    .select("storage_path")
    .in(
      "booking_id",
      bookings!.map((b) => b.id),
    );
  expect(new Set(art!.map((a) => a.storage_path)).size).toBe(4);
});
