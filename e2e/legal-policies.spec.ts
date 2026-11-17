import { expect, test, type Page } from "@playwright/test";

async function openFooterPolicy(page: Page, route: string) {
  const summary = page.getByRole("contentinfo").locator("summary").filter({ hasText: "Policies" });
  if (await summary.isVisible()) await summary.click();
  await page.locator(`footer a[href="/legal/${route}"]:visible`).click();
}

for (const [route, title, count] of [
  ["payment-authorization", "Reservation and Payment Authorization", 7],
  ["cancellation-policy", "Cancellation and Refund Policy", 6],
] as const) {
  test(`${route} is a dedicated explanation with metadata and full-policy links`, async ({ page }) => {
    await page.goto("/");
    await openFooterPolicy(page, route);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Inside914 — ${title}`);
    await expect(page).toHaveTitle(`${title} | Inside914`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://inside914.com/legal/${route}`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Inside914/);
    await expect(page.locator('main article section')).toHaveCount(count);
    await expect(page.getByRole("main")).toContainText("Plain-language guide");
    await expect(page.getByRole("main")).toContainText("Info@inside914.com");
    await expect(page.getByRole("main")).not.toContainText(/hello@inside914.com|internal production-charge setting|Draft content prepared/);
    await expect(page.getByRole("link", { name: "reservation, cancellation and refund policy", exact: true })).toBeVisible();
    await expect(page.getByRole("main")).toContainText("Your accepted agreement and reservation-specific amount remain the governing record.");
  });
}

for (const width of [375, 1440]) {
  for (const [route, title, sections] of [
    ["terms", "Advertising Terms and Conditions", 17],
    ["reservation-policy", "Reservation, Cancellation and Refund Policy", 15],
    ["privacy", "Privacy Policy", 15],
  ] as const) {
    test(`${route} owner-approved reservation policy and footer links at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/");
      await openFooterPolicy(page, route);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Inside914 — ${title}`);
      await expect(page.getByRole("main").locator("article section")).toHaveCount(sections);
      await expect(page.getByRole("main")).toContainText("Effective date: November 2, 2026. Version 2026-11-02-reservations-1.");
      await expect(page.getByRole("main").locator("time")).toHaveAttribute("datetime", "2026-11-02");
      await expect(page.getByRole("main").locator("article")).toContainText("Inside Diagnostics LLC");
      expect(await page.getByRole("main").locator('article a[href="mailto:Info@inside914.com"]').count()).toBeGreaterThan(0);
      await expect(page.getByRole("main").locator("article")).toContainText("Owner-approved for new reservations, effective November 2, 2026.");
      await expect(page.getByRole("main")).not.toContainText(/Status: Proposed policy pending|Effective date: Pending approval/);
      await expect(page.getByRole("main")).not.toContainText(/OWNER MUST|TO BE VERIFIED|Business mailing address/);
      await expect(page.getByRole("main")).toContainText("Westchester County, New York");
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `test-results/legal-${route}-${width}-top.png` });
      await page.screenshot({ path: `test-results/legal-${route}-${width}.png`, fullPage: true });
    });
  }
}
