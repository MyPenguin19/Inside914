import { expect, test } from "@playwright/test";

test("footer stays compact on phones and its links work by keyboard without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await page.goto("http://localhost:3000/");
  const footer = page.getByRole("contentinfo");
  await footer.scrollIntoViewIfNeeded();
  await expect(footer.getByRole("link", { name: "Contact us", exact: true })).toBeVisible();
  await expect(footer.locator('a[href^="mailto:"]')).toBeVisible();
  await expect(footer.locator('a[href^="tel:"]')).toBeVisible();
  expect((await footer.boundingBox())!.height).toBeLessThan(500);

  for (const [section, link] of [
    ["Explore Inside914", "About Inside914"],
    ["Regional advertising", "All advertising areas"],
    ["Policies", "Privacy policy"],
  ]) {
    const nav = footer.getByRole("navigation", { name: section, exact: true });
    await expect(nav.getByRole("link", { name: link, exact: true })).toHaveCount(0);
    const summary = nav.locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(nav.getByRole("link", { name: link, exact: true })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(nav.getByRole("link").first()).toBeFocused();
    await summary.focus();
    await page.keyboard.press("Space");
    await expect(nav.getByRole("link", { name: link, exact: true })).toHaveCount(0);
  }
  await footer.locator("p").first().click();
  await footer.screenshot({ path: "test-results/footer-mobile.png" });

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(footer.getByRole("link", { name: "Privacy policy", exact: true })).toBeVisible();
  await expect(footer.getByRole("link", { name: "About Inside914", exact: true })).toBeVisible();
  await footer.screenshot({ path: "test-results/footer-desktop.png" });

  await page.setViewportSize({ width: 320, height: 812 });
  await footer.getByRole("navigation", { name: "Policies", exact: true }).locator("summary").click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await footer.getByRole("link", { name: "Privacy policy", exact: true }).click();
  await expect(page).toHaveURL(/\/legal\/privacy$/);
  await context.close();
});
