import { expect, test, type Page } from "@playwright/test";

const EDITION_URL = "/editions/00000000-0000-4000-8000-000000000101";

const position = (page: Page, side: "Front" | "Back", label: string) =>
  page.getByRole("button", { name: new RegExp(`^${side} position ${label}:`) });
const totalPrice = (page: Page) => page.getByTestId("total-price");
// Narrow screens show one side at a time (this flips it); wide screens show both, with no toggle.
const showSide = async (page: Page, side: "Front" | "Back") => {
  if (page.viewportSize()!.width >= 1024) return; // wide screens show both sides, no toggle
  const toggle = page.getByRole("group", { name: "Postcard side" });
  const button = toggle.getByRole("button", { name: new RegExp(`^${side}`) });
  // Retry until hydrated: a click on server-rendered HTML does nothing yet.
  await expect(async () => {
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
  }).toPass();
};
// Our error messages live in <main>; Next's route announcer (also role=alert) does not.
const errorAlert = (page: Page) => page.locator("main").getByRole("alert");

test.beforeEach(async ({ page }) => {
  await page.goto(EDITION_URL);
  await expect(page.getByRole("group", { name: "Front of the postcard" })).toBeVisible();
});

test("shows the edition, both sides, the provisional-layout notice and Verified Mail", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Choose your space");
  await expect(page.locator("main header")).toContainText("Central Westchester");
  await expect(page.locator("main header")).toContainText("5,000 homes");
  await expect(page.getByRole("note").filter({ hasText: "Provisional campaign details" })).toBeVisible();
  await showSide(page, "Back");
  await expect(page.getByRole("group", { name: "Back of the postcard" })).toBeVisible();
  await expect(page.getByText(/Provisional layout/)).toBeVisible();
  await expect(page.getByText(/private verification link/)).toBeVisible();
});

test("keyboard: choose a standard position, then switch to a double", async ({ page }) => {
  await position(page, "Front", "F1").focus();
  await page.keyboard.press("Enter");
  await expect(position(page, "Front", "F1")).toHaveAttribute("aria-pressed", "true");
  await expect(totalPrice(page)).toHaveText("$1");

  // Space toggles a different position: the selection moves.
  await position(page, "Front", "F3").focus();
  await page.keyboard.press("Space");
  await expect(position(page, "Front", "F3")).toHaveAttribute("aria-pressed", "true");
  await expect(position(page, "Front", "F1")).toHaveAttribute("aria-pressed", "false");

  // Arrow keys move between the size radios.
  await page.getByRole("radio", { name: /standard/i }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("radio", { name: /double/i })).toBeChecked();

  await position(page, "Front", "F2").focus();
  await page.keyboard.press("Enter");
  await expect(position(page, "Front", "F1")).toHaveAttribute("aria-pressed", "true");
  await expect(position(page, "Front", "F2")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("complementary").getByText("Front · F1 + F2")).toBeVisible();
  await expect(totalPrice(page)).toHaveText("$2");
});

test("two visitors want the same position: the second is told and sees it reserved", async ({ browser }) => {
  const first = await (await browser.newContext()).newPage();
  const second = await (await browser.newContext()).newPage();
  await first.goto(EDITION_URL);
  await showSide(first, "Back");
  // A previous completed local TEST reservation may still own B1. Race for an actually
  // available space, without resetting data or changing another reservation.
  const available = first.getByRole("button", { name: /^Back position B\d+: Available/ }).first();
  const label = await available.getAttribute("data-slot-label");
  if (!label) throw new Error("No available back position for the concurrency test");
  await available.click();
  await second.goto(EDITION_URL);
  await showSide(second, "Back");
  await position(second, "Back", label).click();

  await first.getByRole("button", { name: /hold this position/i }).click();
  const held = first.getByRole("heading", { name: "Your position is on hold" });
  const firstError = errorAlert(first);
  await expect(held.or(firstError)).toBeVisible({ timeout: 15_000 });
  test.skip(await firstError.isVisible(), "holds need SUPABASE_SECRET_KEY on the server");

  try {
    await second.getByRole("button", { name: /hold this position/i }).click();
    await expect(errorAlert(second)).toContainText(/another business just reserved/i);
    await expect(position(second, "Back", label)).toBeDisabled();
    await expect(position(second, "Back", label)).toHaveAccessibleName(/On hold/); // held by the first visitor, not yet confirmed
    await expect(second).toHaveURL(new RegExp(`${EDITION_URL}$`));
  } finally {
    await first.getByRole("button", { name: "Change selection" }).click(); // release the test hold
    await expect(first).toHaveURL(new RegExp(`${EDITION_URL}$`));
  }
});

test("holding never fakes success: it either reaches the hold page or explains why not", async ({ page }) => {
  // Any open back position, so a hold left by an interrupted run can't block this test.
  await showSide(page, "Back");
  await page.getByRole("button", { name: /^Back position B\d+: Available/ }).first().click();
  await page.getByRole("button", { name: /hold this position/i }).click();

  const holdPage = page.getByRole("heading", { name: "Your position is on hold" });
  const failure = errorAlert(page);
  await expect(holdPage.or(failure)).toBeVisible({ timeout: 15_000 });
  if (await failure.isVisible()) {
    await expect(page).toHaveURL(new RegExp(`${EDITION_URL}$`));
    await expect(failure).toContainText(/nothing was reserved|another business/i);
    return;
  }
  try {
    await expect(page.getByText(/left/)).toBeVisible(); // live countdown
    await expect(page.locator("dd", { hasText: "$1" })).toBeVisible(); // hold summary price (test pricing)
    await page.getByRole("link", { name: "Continue to artwork upload" }).click();
    await expect(page.getByRole("heading", { name: "Add your artwork" })).toBeVisible();
  } finally {
    await page.goto("/book/hold");
    // Release the hold so the test leaves no reservation behind.
    await page.getByRole("button", { name: "Change selection" }).click();
    await expect(page).toHaveURL(new RegExp(`${EDITION_URL}$`));
  }
});

test("mobile: both sides and the summary fit without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await showSide(page, "Back");
  await expect(page.getByRole("group", { name: "Back of the postcard" })).toBeVisible();
  await expect(page.getByRole("button", { name: /hold this position/i })).toBeAttached();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await showSide(page, "Front");
  const box = await position(page, "Front", "F1").boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44); // comfortable tap target
  expect(box!.height).toBeGreaterThanOrEqual(44);
});
