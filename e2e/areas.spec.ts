import { expect, test } from "@playwright/test";

test("area catalog presents four areas without a category requirement", async ({ page }) => {
  await page.goto("/areas");
  await expect(page.getByRole("heading", { name: "Choose your areas." })).toBeVisible();
  await expect(page.getByLabel("Choose your business category")).toHaveCount(0);
  for (const area of ["Central", "Southern", "Northern", "Eastern"]) {
    await expect(page.getByRole("checkbox", { name: new RegExp(`${area} Westchester`) })).toBeVisible();
  }
  for (const id of ["00000000-0000-4000-8000-000000000102", "00000000-0000-4000-8000-000000000999"]) {
    await page.goto(`/editions/${id}`);
    await expect(page).toHaveURL(/\/areas$/);
  }
});

test("area selection fits mobile through desktop", async ({ page }) => {
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/areas");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("group", { name: "Choose areas on the Westchester map" })).toBeVisible();
    await page.screenshot({ path: `test-results/area-map-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

// Retired account features must not accidentally return as the route tree is cleaned up.
test("old customer account and dashboard links redirect to areas", async ({ page }) => {
  for (const path of ["/account/login", "/account/signup", "/account/callback", "/dashboard", "/dashboard/recurring/example"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/areas$/);
  }
});
