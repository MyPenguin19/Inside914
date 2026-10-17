import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

// REAL end-to-end up to the card form (real holds, uploads, details). The card step itself runs
// only when a Stripe TEST publishable key is configured; otherwise that test is skipped.

const EDITION_URL = "/editions/00000000-0000-4000-8000-000000000101";
const devTestMode = process.env.INSIDE914_DEV_TEST_RESERVATIONS === "true";
const hasStripe = !devTestMode && /^pk_test_/.test(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");
const errorAlert = (page: Page) => page.locator("main").getByRole("alert");

async function toDetails(page: Page) {
  await page.goto(EDITION_URL);
  const sides = page.getByRole("group", { name: "Postcard side" });
  if (page.viewportSize()!.width < 1024) {
    // Narrow screens only. Retry until hydrated: a click on server-rendered HTML does nothing yet.
    const back = sides.getByRole("button", { name: /^Back/ });
    await expect(async () => {
      await back.click();
      await expect(back).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
    }).toPass();
  }
  await page.getByRole("button", { name: /^Back position B\d+: Available/ }).first().click();
  await page.getByRole("button", { name: /hold this position/i }).click();
  await page.getByRole("link", { name: "Continue to artwork upload" }).click();
  const png = await sharp({ create: { width: 1300, height: 1200, channels: 3, background: { r: 20, g: 90, b: 70 } } }).png().toBuffer();
  await page.getByLabel("Ad image file").setInputFiles({ name: "ad.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText(/Image uploaded/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("link", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your business details" })).toBeVisible();
}

async function fillDetails(page: Page) {
  await page.getByLabel("Business name").fill("Luigi's Pizzeria");
  await page.getByLabel("Your name").fill("Ana Ruiz");
  await page.getByLabel("Email").fill("ana@example.com");
  await page.getByLabel("Phone").fill("914 555 0123");
}

test.afterEach(async ({ page }) => {
  await page.goto("/book/hold");
  const change = page.getByRole("button", { name: "Change selection" });
  const other = page.getByRole("heading", { level: 1 });
  await expect(change.or(other).first()).toBeVisible({ timeout: 15_000 });
  if (await change.isVisible()) await change.click();
});

test("details: inline errors, kept values, then the payment step with an unticked consent", async ({ page }) => {
  await toDetails(page);
  await page.getByRole("button", { name: "Continue to payment details" }).click();
  await expect(page.getByText("Please enter your business name.")).toBeVisible();
  await expect(page.getByLabel("Business name")).toHaveAttribute("aria-invalid", "true");

  await fillDetails(page);
  await page.getByLabel("Email").fill("ana@");
  await page.getByRole("button", { name: "Continue to payment details" }).click();
  await expect(page.getByText(/valid email address/)).toBeVisible();
  await expect(page.getByLabel("Business name")).toHaveValue("Luigi's Pizzeria"); // kept

  await page.getByLabel("Email").fill("Ana@Example.com");
  await page.getByRole("button", { name: "Continue to payment details" }).click();
  await expect(page.getByRole("heading", { name: "Reserve your space" })).toBeVisible();

  const summary = page.getByRole("region", { name: "Reservation summary" });
  await expect(summary).toContainText("Central Westchester");
  await expect(summary).toContainText("5,000 homes");
  await expect(summary).toContainText("$1");
  await expect(summary).toContainText("Test price");
  if (hasStripe || devTestMode) {
    await expect(page.getByRole("checkbox")).not.toBeChecked();
    await expect(page.getByRole("checkbox").locator("..")).toContainText("charge $1");
  } else {
    await expect(errorAlert(page)).toContainText("aren't set up");
  }

  // Going back keeps what was saved (normalized).
  await page.getByRole("link", { name: "Back to your details" }).click();
  await expect(page.getByLabel("Email")).toHaveValue("ana@example.com");
  await expect(page.getByLabel("Phone")).toHaveValue("(914) 555-0123");
});

test("mobile: details form fits the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toDetails(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole("button", { name: "Continue to payment details" })).toBeVisible();
});

test("full checkout with a Stripe test card", async ({ page }) => {
  test.skip(!hasStripe, "needs NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (pk_test_) and STRIPE_SECRET_KEY (sk_test_)");
  test.setTimeout(90_000);
  await toDetails(page);
  await fillDetails(page);
  await page.getByRole("button", { name: "Continue to payment details" }).click();

  const card = page.frameLocator('iframe[title*="Secure payment input"]').first();
  await card.getByLabel(/card number/i).fill("4242424242424242");
  await card.getByLabel(/expiration/i).fill("12 / 34");
  await card.getByLabel(/security code|cvc/i).fill("123");
  const zip = card.getByLabel(/zip|postal/i);
  if (await zip.count()) await zip.fill("10601");

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /save card and reserve/i }).click();
  await expect(page.getByRole("heading", { name: "Your advertising space is reserved." })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("No payment has been collected.")).toBeVisible();
});

test("development TEST mode: the whole booking completes as a clearly labeled TEST reservation", async ({ page }) => {
  test.skip(!devTestMode, "run with INSIDE914_DEV_TEST_RESERVATIONS=true");
  test.setTimeout(90_000);
  await toDetails(page);
  await fillDetails(page);
  await page.getByRole("button", { name: "Continue to payment details" }).click();

  await expect(page.getByText(/TEST MODE \(development only\): no card is saved and no payment is authorized/)).toBeVisible();
  await expect(page.locator('iframe[title*="Secure payment input"]')).toHaveCount(0); // Stripe never loads
  const submit = page.getByRole("button", { name: /simulate card and create TEST reservation/i });
  await expect(submit).toBeDisabled(); // consent still required
  await page.getByRole("checkbox").check();
  await submit.click();

  await expect(page.getByRole("heading", { name: "Test reservation complete" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/TEST RESERVATION \(development only\): this is not a real booking/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your advertising space is reserved." })).toHaveCount(0);
});
