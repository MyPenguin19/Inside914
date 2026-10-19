import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { localLayoutFixture } from "../tests/integration/local-layout-fixture";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const zone = randomUUID(), edition = randomUUID(), layout = `test-approved-${randomUUID()}`;
const path = `/editions/${edition}`;
test.beforeAll(async () => {
  localLayoutFixture(layout);
  expect((await db.from("zones").insert({ id: zone, name: `E2E full side ${zone}`, slug: `full-side-${zone}`, household_count: 0 })).error).toBeNull();
  expect((await db.from("editions").insert({ id: edition, zone_id: zone, issue_month: "2098-01-01", status: "open", artwork_deadline: "2097-12-15T23:59:00Z", unit_price_cents: 50000, double_unit_price_cents: 90000, layout_template: layout })).error).toBeNull();
  const slots = ["front", "back"].flatMap(side => Array.from({ length: 8 }, (_, i) => ({ edition_id: edition, side, label: `${side === "front" ? "F" : "B"}${i + 1}`, x_in: i % 2 * 3.25, y_in: Math.floor(i / 2) * 3, width_in: 3.25, height_in: 3 })));
  expect((await db.from("slots").insert(slots)).error).toBeNull();
});
test.afterEach(async () => {
  const { data: bookings } = await db.from("bookings").select("id").eq("edition_id", edition);
  if (bookings?.length) {
    const { data: art } = await db.from("booking_artwork").select("storage_path").in("booking_id", bookings.map(b => b.id));
    if (art?.length) await db.storage.from("artwork").remove(art.map(a => a.storage_path));
    await db.from("bookings").delete().eq("edition_id", edition);
  }
});
test.afterAll(async () => {
  await db.from("editions").delete().eq("id", edition);
  await db.from("zones").delete().eq("id", zone);
  localLayoutFixture(layout, true);
});

test("full-side choices preserve the responsive layout and hold all selected inventory", async ({ page }) => {
  test.setTimeout(60000);
  for (const width of [320, 375, 390, 768, 1440]) {
    console.log(`Checking ${width}px`);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path);
    await expect(async () => { await page.getByRole("radio", { name: /Both sides/ }).click(); await expect(page.getByTestId("total-price")).toHaveText("$2,900", { timeout: 1000 }); }).toPass({ timeout: 10000 });
    await expect(page.getByTestId("total-price")).toHaveText("$2,900");
    const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll("main *")].filter(el => el.getBoundingClientRect().right > innerWidth).map(el => ({ tag: el.tagName, text: el.textContent?.slice(0, 100), right: el.getBoundingClientRect().right, class: el.className })) }));
    expect(overflow.scroll - overflow.width, JSON.stringify(overflow)).toBeLessThanOrEqual(0);
    const full = page.getByRole("radio", { name: /Full side/ });
    await expect(async () => { await full.click(); await expect(page.getByTestId("total-price")).toHaveText("$1,600", { timeout: 1000 }); }).toPass({ timeout: 10000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    if (width === 375) await page.screenshot({ path: "../phase2-mobile.png", fullPage: true });
    await page.getByRole("button", { name: /^Front position F1: Available/ }).click();
    await page.getByRole("button", { name: /hold this position/i }).click();
    await expect(page).toHaveURL(/\/book\/hold$/);
    await expect(page.getByRole("heading", { name: "Your position is on hold" })).toBeVisible();
    await expect(page.locator("section").filter({ has: page.getByRole("heading", { name: "Your position is on hold" }) }).getByText("Front · all advertising spaces")).toBeVisible();
    await expect(page.locator("section").filter({ has: page.getByRole("heading", { name: "Your position is on hold" }) }).getByText("$1,600", { exact: true })).toBeVisible();
    const { data: held } = await db.from("bookings").select("claimed_slot_count").eq("edition_id", edition).eq("status", "pending");
    expect(held).toEqual([{ claimed_slot_count: 8 }]);
    await page.getByRole("button", { name: "Change selection" }).click();
    await expect(page).toHaveURL(new RegExp(`/editions/${edition}$`));
    await expect(page.getByRole("radio", { name: /Both sides/ })).toBeEnabled();
  }
});

test("another visitor cannot overlap a held side, but can reserve the opposite side", async ({ page, browser }) => {
  await page.goto(path, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /Full side/ }).check();
  await page.getByRole("button", { name: /^Front position F1: Available/ }).click();
  await page.getByRole("button", { name: /hold this position/i }).click();
  await expect(page).toHaveURL(/\/book\/hold$/);
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await other.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
    await expect(other.getByRole("radio", { name: /Both sides/ })).toBeDisabled();
    await other.getByRole("radio", { name: /Full side/ }).check();
    await expect(other.getByRole("button", { name: /^Front position F1:/ })).toBeDisabled();
    await other.getByRole("button", { name: /^Back position B1: Available/ }).click();
    await other.getByRole("button", { name: /hold this position/i }).click();
    await expect(other).toHaveURL(/\/book\/hold$/);
    await expect(other.locator("section").filter({ has: other.getByRole("heading", { name: "Your position is on hold" }) }).getByText("Back · all advertising spaces")).toBeVisible();
  } finally { await context.close(); }
});

test("both sides completes artwork, consent and simulated checkout at $2,900", async ({ page }) => {
  test.skip(process.env.INSIDE914_DEV_TEST_RESERVATIONS !== "true", "requires local simulated checkout");
  test.setTimeout(90000);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(path, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /Both sides/ }).check();
  await expect(page.getByText(/same artwork is used on front and back/)).toBeVisible();
  await page.getByRole("button", { name: /^Front position F1: Available/ }).click();
  await page.getByRole("button", { name: /hold this position/i }).click();
  await page.getByRole("link", { name: "Continue to artwork upload" }).click();
  const png = await sharp({ create: { width: 1950, height: 3600, channels: 3, background: "green" } }).png().toBuffer();
  await page.getByLabel("Ad image file").setInputFiles({ name: "ad.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText(/Image uploaded/)).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page.getByRole("img", { name: /Preview of the front/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Preview of the back/ })).toBeVisible();
  await page.getByRole("link", { name: "Continue", exact: true }).click();
  await page.getByLabel("Business name").fill("Full postcard test");
  await page.getByLabel("Your name").fill("Local Test");
  await page.getByLabel("Email").fill("full-test@example.com");
  await page.getByLabel("Phone").fill("9145550123");
  await page.getByRole("button", { name: "Continue to payment details" }).click();
  await expect(page.getByRole("region", { name: "Reservation summary" })).toContainText("$2,900");
  await expect(page.getByRole("checkbox").locator("..")).toContainText("$2,900");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /simulate card and create TEST reservation/i }).click();
  await expect(page.getByRole("heading", { name: "Test reservation complete" })).toBeVisible({ timeout: 30000 });
  const { data } = await db.from("bookings").select("size, price_cents, claimed_slot_count, status").eq("edition_id", edition).single();
  expect(data).toEqual({ size: "both_sides", price_cents: 290000, claimed_slot_count: 16, status: "reserved" });
});
