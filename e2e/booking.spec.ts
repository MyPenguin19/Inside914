import { expect, test, type Page } from "@playwright/test";

const EDITION_URL = "/editions/00000000-0000-4000-8000-000000000101";

const position = (page: Page, side: "Front" | "Back", label: string) =>
  page.getByRole("button", { name: new RegExp(`^${side} position ${label}:`) });
const totalPrice = (page: Page) => page.getByTestId("total-price");

test.beforeEach(async ({ page }) => {
  await page.goto(EDITION_URL);
  await expect(page.getByRole("group", { name: "Front of the postcard" })).toBeVisible();
});

test("shows the edition, both sides, the provisional-layout notice and Verified Mail", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Central Westchester");
  await expect(page.getByText(/Planned mailing quantity/)).toContainText("5,000 homes");
  await expect(page.getByRole("group", { name: "Back of the postcard" })).toBeVisible();
  await expect(page.getByText("Provisional layout.")).toBeVisible();
  await expect(page.getByText(/private verification link/)).toBeVisible();
});

test("keyboard: choose a standard position, then switch to a double", async ({ page }) => {
  await position(page, "Front", "F1").focus();
  await page.keyboard.press("Enter");
  await expect(position(page, "Front", "F1")).toHaveAttribute("aria-pressed", "true");
  await expect(totalPrice(page)).toHaveText("$500");

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
  await expect(page.getByText("Front · F1 + F2")).toBeVisible();
  await expect(totalPrice(page)).toHaveText("$900");
});

test("reserved positions are shown as reserved and can't be selected", async ({ page }) => {
  const reserved = page.getByRole("button", { name: /: Reserved/ });
  test.skip((await reserved.count()) === 0, "no reserved positions in the current data");
  await expect(reserved.first()).toBeDisabled();
});

test("holding never fakes success: it either reaches the hold page or explains why not", async ({ page }) => {
  await position(page, "Back", "B3").click();
  await page.getByRole("button", { name: /hold this position/i }).click();

  const holdPage = page.getByRole("heading", { name: "Your position is on hold" });
  const failure = page.getByRole("alert").filter({ hasText: /\S/ }); // skip Next's empty route announcer
  await expect(holdPage.or(failure)).toBeVisible({ timeout: 15_000 });
  if (await failure.isVisible()) {
    await expect(page).toHaveURL(new RegExp(`${EDITION_URL}$`));
    await expect(failure).toContainText(/nothing was reserved|another business/i);
  } else {
    // Release the hold so the test leaves no reservation behind.
    await page.getByRole("button", { name: "Change selection" }).click();
    await expect(page).toHaveURL(new RegExp(`${EDITION_URL}$`));
  }
});

test("mobile: both sides and the summary fit without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("group", { name: "Back of the postcard" })).toBeVisible();
  await expect(page.getByRole("button", { name: /hold this position/i })).toBeAttached();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  const box = await position(page, "Front", "F1").boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44); // comfortable tap target
  expect(box!.height).toBeGreaterThanOrEqual(44);
});
