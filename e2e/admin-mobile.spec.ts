import { expect, test } from "@playwright/test";
import { createOriginalFixture } from "../tests/fixtures/originals";

test.use({ hasTouch: true });

test("phone menu reaches every admin section and loaded records fit narrow screens", async ({ page }) => {
  test.setTimeout(120_000);
  const fixture = await createOriginalFixture();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    for (const id of fixture.bookings.slice(0, 2)) {
      expect((await fixture.db.from("bookings").update({ status: "reserved", confirmed_at: new Date().toISOString(), reference: `IN914-${id.replaceAll("-", "").slice(0, 6).toUpperCase().replaceAll("0", "G").replaceAll("1", "H")}`, stripe_payment_method_id: `pm_devtest_mobile_${id}`, stripe_setup_intent_id: `seti_devtest_mobile_${id}` }).eq("id", id)).error).toBeNull();
    }
    const snapshot = await fixture.snapshot();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your current campaigns" })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Admin", exact: true });
    const sections = ["Home", "Campaigns", "Advertisers", "Review artwork", "Payments", "Advertising areas", "Settings"];
    for (const width of [320, 375, 430, 768]) {
      await page.setViewportSize({ width, height: 812 });
      expect((await page.locator("aside").boundingBox())!.height).toBeLessThanOrEqual(80);
      await page.getByRole("button", { name: "Menu", exact: true }).tap();
      for (const name of sections) {
        const link = nav.getByRole("link", { name, exact: true });
        await expect(link).toBeInViewport();
        const box = (await link.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      if (width === 375) await page.screenshot({ path: "../../outputs/inside914-admin-audit/mobile-menu.png" });
      // Escape restores keyboard focus and hides the links, not just their overflow.
      await nav.getByRole("link", { name: "Settings", exact: true }).focus();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeFocused();
      await expect(nav.getByRole("link", { name: "Settings", exact: true })).toBeHidden();
    }
    await page.setViewportSize({ width: 375, height: 812 });
    for (const section of sections.slice(1).concat("Home")) {
      await page.getByRole("button", { name: "Menu", exact: true }).tap();
      await nav.getByRole("link", { name: section, exact: true }).tap();
      await expect(page.getByRole("button", { name: "Menu", exact: true })).toHaveAttribute("aria-expanded", "false");
      await expect(nav.getByRole("link", { name: section, exact: true, includeHidden: true })).toHaveAttribute("aria-current", "page");
      const heading = { "Review artwork": "Artwork", "Advertising areas": "Advertising areas", Home: "Manage Inside914" }[section] ?? section;
      await expect(page.getByRole("heading", { name: heading, level: 1, exact: true })).toBeVisible();
      await expect(page.locator('main [aria-busy="true"]:visible')).toHaveCount(0);
      await expect(page.getByRole("alert").filter({ hasText: /couldn.t load|could not load/i })).toHaveCount(0);
      for (const width of [320, 375, 430, 768]) {
        await page.setViewportSize({ width, height: 812 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth), `${section} at ${width}`).toBeLessThanOrEqual(width);
      }
      await page.setViewportSize({ width: 375, height: 812 });
      if (["Campaigns", "Review artwork", "Payments"].includes(section)) {
        const caption = { Campaigns: "Campaigns", "Review artwork": "Artwork submissions", Payments: "Payment authorizations" }[section];
        await expect(page.getByRole("list", { name: caption, exact: true })).toBeVisible();
        await page.screenshot({ path: `../../outputs/inside914-admin-audit/mobile-${section.toLowerCase().replaceAll(" ", "-")}.png`, fullPage: true });
        await page.getByRole("list", { name: caption, exact: true }).getByRole("listitem").last().scrollIntoViewIfNeeded();
        await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeInViewport();
      }
    }
    await page.setViewportSize({ width: 1440, height: 950 });
    await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeHidden();
    await expect(nav.getByRole("link")).toHaveCount(7);
    await nav.getByRole("link", { name: "Campaigns", exact: true }).click();
    await expect(nav.getByRole("link", { name: "Campaigns", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("table", { name: "Campaigns", exact: true })).toBeVisible();
    await page.screenshot({ path: "../../outputs/inside914-admin-audit/desktop-campaigns.png", fullPage: true });
    expect(errors).toEqual([]);
    expect(await fixture.snapshot()).toEqual(snapshot);
  } finally {
    await fixture.cleanup();
  }
});
