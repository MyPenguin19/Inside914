import { expect, test } from "@playwright/test";

for (const width of [375, 1440]) {
  for (const [route, title, sections] of [
    ["terms", "Advertising Terms and Conditions", 17],
    ["reservation-policy", "Reservation, Cancellation and Refund Policy", 15],
    ["privacy", "Privacy Policy", 15],
  ] as const) {
    test(`${route} complete review policy and footer links at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/");
      await page.locator(`footer a[href="/legal/${route}"]`).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Inside914 — ${title}`);
      await expect(page.getByRole("main").locator("article section")).toHaveCount(sections);
      await expect(page.getByRole("main")).toContainText("Version 2026-10-24-review-4. Effective date: Pending approval.");
      await expect(page.getByRole("main").locator("article")).toContainText("Inside Diagnostics LLC");
      expect(await page.getByRole("main").locator('article a[href="mailto:Info@inside914.com"]').count()).toBeGreaterThan(0);
      await expect(page.getByRole("main").locator("article")).toContainText("qualified legal-counsel review");
      await expect(page.getByRole("main")).not.toContainText(/OWNER MUST|TO BE VERIFIED|Business mailing address/);
      await expect(page.getByRole("main")).toContainText("Westchester County, New York");
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `test-results/legal-${route}-${width}-top.png` });
      await page.screenshot({ path: `test-results/legal-${route}-${width}.png`, fullPage: true });
    });
  }
}
