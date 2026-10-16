import { expect, test } from "@playwright/test";

test("landing page explains the product and lists the open edition", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Inside914");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Local advertising you can verify.");
  await expect(page.getByRole("heading", { name: "Know your ad actually went out." })).toBeVisible();

  const edition = page.getByRole("article").filter({ hasText: "Central Westchester" });
  await expect(edition).toContainText("Planned mailing");
  await expect(edition).toContainText("≈ 5,000 homes");
  await expect(edition).toContainText("$500");
  await edition.getByRole("link", { name: /view the postcard/i }).click();
  await expect(page).toHaveURL(/\/editions\/[0-9a-f-]{36}$/);
});
