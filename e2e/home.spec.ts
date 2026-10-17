import { expect, test } from "@playwright/test";

test("homepage: hero, Verified Mail, how it works, pricing, FAQ and footer", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Inside914");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your Business.5,000 Local Mailboxes.");
  await expect(page.getByText(/reserve without paying upfront/)).toBeVisible();
  await expect(page.getByRole("img", { name: /Illustration of the shared Inside914 postcard/ })).toBeVisible();
  await expect(page.getByText("Illustration only: sample ads, provisional layout.")).toBeVisible();

  for (const heading of ["Advertising you can actually follow.", "Four simple steps.", "Simple, fixed prices.", "Good to know."]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  const pricing = page.locator("#pricing");
  await expect(pricing).toContainText("Standard Advertisement");
  await expect(pricing).toContainText("$500");
  await expect(pricing).toContainText("$900");

  // FAQ answers open on click (and keyboard: summary elements are focusable).
  const question = page.getByText("What if the postcard doesn't fill?");
  await question.click();
  await expect(page.getByText(/your reservation is canceled and you aren't charged/)).toBeVisible();

  const footer = page.getByRole("contentinfo");
  for (const link of ["Advertising terms", "Reservation policy", "Privacy policy"]) {
    await expect(footer.getByRole("link", { name: link })).toBeVisible();
  }

  await page.getByRole("link", { name: "View Available Spaces" }).first().click();
  await expect(page).toHaveURL(/\/demo\/areas$/);
});

test("homepage: no sideways scrolling on a phone, and the menu opens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByText("Menu", { exact: true }).click();
  await expect(page.getByRole("link", { name: "How It Works" }).last()).toBeVisible();
});
