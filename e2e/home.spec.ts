import { expect, test } from "@playwright/test";

test("homepage: hero, how it works, pricing, FAQ and footer", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Westchester Postcard Advertising | Inside914");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your Business.Westchester Mailboxes.");
  await expect(page.getByText(/Pick your areas, choose a position, and add your ad/)).toBeVisible();
  await expect(page.getByRole("img", { name: /Front of the sample postcard/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Verified Mail" })).toHaveCount(0);
  await expect(page.locator("#verified-mail")).toHaveCount(0);
  await expect(page.getByText("How does mailing verification work?")).toHaveCount(0);
  await expect(page.getByText(/Reservations are not open yet/)).toHaveCount(0);

  for (const heading of ["Four simple steps.", "Simple, clear pricing.", "Good to know."]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  const pricing = page.locator("#pricing");
  await expect(pricing).toContainText("Postcard Advertisement");
  await expect(pricing).toContainText("$399");
  await expect(pricing).toContainText("10 advertising spaces");
  await expect(pricing).not.toContainText("Double");

  // FAQ answers open on click (and keyboard: summary elements are focusable).
  const question = page.getByText("What if the postcard doesn't fill?");
  await question.click();
  await expect(page.getByText(/new reservations close while Inside914 reviews cancellation or revised dates/)).toBeVisible();

  const footer = page.getByRole("contentinfo");
  for (const link of ["Advertising terms", "Reservation policy", "Privacy policy"]) {
    await expect(footer.getByRole("link", { name: link })).toBeVisible();
  }

  await page.getByRole("link", { name: "Explore Advertising Areas" }).first().click();
  await expect(page).toHaveURL(/\/areas$/); // the live areas page
});

test("homepage: sample postcard flips with mouse and keyboard at mobile and desktop sizes", async ({ page }) => {
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const sample = page.getByRole("figure", { name: "Interactive sample card" });
    const front = sample.getByRole("img", { name: /Front of the sample postcard/ });
    await expect(front).toBeVisible();
    await expect(front.locator("[data-sample-slot]")).toHaveCount(6);
    const before = await sample.boundingBox();

    await sample.getByRole("button", { name: "Flip postcard" }).click();
    const back = sample.getByRole("img", { name: /Back of the sample postcard/ });
    await expect(back).toBeVisible();
    await expect(front).toHaveCount(0);
    await expect(back.locator("[data-sample-slot]")).toHaveCount(4);
    await expect(back.getByText("Mailing panel", { exact: true })).toBeVisible();
    await expect(back.getByText("Inside914 panel", { exact: true })).toBeVisible();
    await expect(sample.getByRole("button", { name: "View front" })).toBeFocused();
    expect((await sample.boundingBox())!.height).toBeCloseTo(before!.height, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    // The focused native button supports both Enter and Space without scrolling or navigation.
    await page.keyboard.press("Enter");
    await expect(front).toBeVisible();
    await page.keyboard.press("Space");
    await expect(back).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    // Finish finite animations before capturing each face for visual review.
    const flipButton = sample.getByRole("button", { name: "View front" });
    await expect(flipButton).toHaveAttribute("aria-pressed", "true");
    await sample.screenshot({ path: `test-results/sample-postcard-back-${width}.png`, animations: "disabled" });
    await flipButton.click();
    await sample.screenshot({ path: `test-results/sample-postcard-front-${width}.png`, animations: "disabled" });
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Flip postcard" }).click();
  await expect(page.getByRole("img", { name: /Back of the sample postcard/ })).toBeVisible();
  const contentId = await page.getByRole("button", { name: "View front" }).getAttribute("aria-controls");
  await expect(page.locator(`[id="${contentId}"] > div`)).toHaveCSS("transition-property", "none");
});

test("homepage: no sideways scrolling on a phone, and the menu opens", async ({ page }) => {
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/areas"]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (route === "/areas") await expect(page.getByText("Choose an area to get started", { exact: false })).toBeVisible();
      if (route === "/") {
        for (const summary of await page.locator("#faq summary").all()) await summary.click();
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} at ${width}px`).toBeLessThanOrEqual(0);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("banner").getByText("Menu", { exact: true }).click();
  await expect(page.locator("header").getByRole("link", { name: "How It Works" }).last()).toBeVisible();
});
