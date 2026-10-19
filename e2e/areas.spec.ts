import { expect, test } from "@playwright/test";

// LIVE areas page: values come from the dev Supabase project (published editions only).

test("lists the open Central Westchester campaign from Supabase and leads to its postcard", async ({ page }) => {
  await page.goto("/areas");
  await expect(page.getByRole("heading", { name: "Choose your advertising area." })).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: "Provisional campaign details" })).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: "$1 standard, $2 double" })).toBeVisible(); // temporary pricing notice

  const central = page.getByRole("article").filter({ hasText: "Central Westchester" });
  await expect(central).toContainText("Available");
  await expect(central).toContainText("≈ 5,000 homes");
  await expect(central).toContainText("$1 / $2"); // temporary TEST prices (e2e runs with INSIDE914_PRICING_MODE=test)
  await expect(central).toContainText("December 15, 2026"); // reserve-by, from editions.artwork_deadline
  await expect(central).toContainText("January 5, 2027"); // planned mail date, from editions.mail_date
  await expect(central.getByText(/^\d+ of 16$/)).toBeVisible(); // open count comes from live availability

  // Unpublished areas keep the existing coming-soon treatment without invented availability.
  for (const name of ["Southern Westchester", "Northern Westchester", "Eastern Westchester"]) {
    const area = page.getByRole("article").filter({ hasText: name });
    await expect(area).toContainText("Coming soon");
    await expect(area.getByRole("link")).toHaveCount(0);
    await expect(area).not.toContainText("5,000");
  }

  // The draft February edition stays hidden.
  await expect(page.getByText("February 2027")).toHaveCount(0);

  await central.getByRole("link", { name: /See open spaces/ }).click();
  await expect(page).toHaveURL(/\/editions\/00000000-0000-4000-8000-000000000101$/);
  await expect(page.getByRole("heading", { name: "Choose your space", level: 1 })).toBeVisible();
});

test("an unknown or unpublished (draft) edition shows the not-found page and no inventory", async ({ page }) => {
  // The page streams, so the HTTP status is already 200 when notFound() runs; check what renders.
  for (const id of ["00000000-0000-4000-8000-000000000102", "00000000-0000-4000-8000-000000000999"]) {
    await page.goto(`/editions/${id}`);
    await expect(page.getByRole("heading", { name: "Page not found", level: 1 })).toBeVisible();
    await expect(page.getByRole("group", { name: /of the postcard/ })).toHaveCount(0);
    await expect(page.getByText("February 2027")).toHaveCount(0);
  }
});

test("areas and the live postcard fit phone and desktop screens", async ({ page }) => {
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/areas", "/editions/00000000-0000-4000-8000-000000000101"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} @ ${width}`).toBeLessThanOrEqual(0);
    }
  }
});
