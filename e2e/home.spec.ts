import { expect, test } from "@playwright/test";

test("homepage: hero, Verified Mail, how it works, pricing, FAQ and footer", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Inside914");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your Business.Thousands of Local Mailboxes.");
  await expect(page.getByText(/Pick your areas, choose a position, and add your ad/)).toBeVisible();
  await expect(page.getByRole("img", { name: /Illustration of the shared Inside914 postcard/ })).toBeVisible();

  for (const heading of ["Four simple steps.", "Simple, fixed pricing.", "Good to know."]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  const pricing = page.locator("#pricing");
  await expect(pricing).toContainText("Postcard Advertisement");
  await expect(pricing).toContainText("$399 per area");
  await expect(pricing).toContainText("10 advertising spaces");
  await expect(pricing).not.toContainText("Double");

  // FAQ answers open on click (and keyboard: summary elements are focusable).
  const question = page.getByText("What if the postcard doesn't fill?");
  await question.click();
  await expect(page.getByText(/that reservation is canceled without charge/)).toBeVisible();

  const footer = page.getByRole("contentinfo");
  for (const link of ["Advertising terms", "Reservation policy", "Privacy policy"]) {
    await expect(footer.getByRole("link", { name: link })).toBeVisible();
  }

  await page.getByRole("link", { name: "View Available Spaces" }).first().click();
  await expect(page).toHaveURL(/\/areas$/); // the live areas page
});

test("homepage: no sideways scrolling on a phone, and the menu opens", async ({ page }) => {
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/areas"]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (route === "/areas") await expect(page.getByRole("heading", { name: "Selected: 0 areas" })).toBeVisible();
      if (route === "/") {
        for (const summary of await page.locator("#faq summary").all()) await summary.click();
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} at ${width}px`).toBeLessThanOrEqual(0);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByText("Menu", { exact: true }).click();
  await expect(page.getByRole("link", { name: "How It Works" }).last()).toBeVisible();
});
