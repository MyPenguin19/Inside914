import { REGIONS } from "../src/lib/catalog/regions";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

// REAL admin UI against the LOCAL Supabase stack: a throwaway admin (owner-approved) works on a throwaway
// far-future campaign it creates; everything is removed afterwards. The live campaign isn't touched.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
test.skip(!url || !secret, "needs the dev Supabase project in .env.local");
test.describe.configure({ mode: "serial" });

const service = url && secret ? createClient(url, secret, { auth: { persistSession: false } }) : null;
const admin = { id: "", email: `inside914-e2e-ops-${randomUUID()}@example.com`, password: randomBytes(24).toString("base64url") };
const year = 2080 + Math.floor(Math.random() * 9);
const name = `E2E campaign ${year}`;
const zoneSlug = `e2e-zone-${randomUUID()}`;

test.beforeAll(async () => {
  const { data, error } = await service!.auth.admin.createUser({ email: admin.email, password: admin.password, email_confirm: true });
  if (error) throw error;
  admin.id = data.user.id;
  await service!.from("admins").insert({ user_id: admin.id });
});

test.afterAll(async () => {
  const { data } = await service!.from("editions").select("id").like("name", `E2E campaign ${year}%`);
  for (const e of data ?? []) await service!.from("editions").delete().eq("id", e.id);
  await service!.from("zones").delete().eq("slug", zoneSlug);
  await service!.from("admin_events").delete().eq("admin_user_id", admin.id);
  await service!.auth.admin.deleteUser(admin.id);
});

async function signIn(page: Page) {
  await page.goto("/admin/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(admin.email);
  await page.getByLabel("Password").fill(admin.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

const main = (page: Page) => page.getByRole("main");

test("manage a geographic zone without publishing it", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/zones");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Create zone", exact: true }) });
  await form.getByLabel("Zone name").fill(`E2E zone ${zoneSlug}`);
  await form.getByLabel(/^Slug/).fill(zoneSlug);
  await form.getByLabel("Target households (provisional)").fill("5000");
  await form.getByRole("button", { name: "Create zone", exact: true }).click();
  await expect(page.getByRole("heading", { name: `E2E zone ${zoneSlug}`, exact: true })).toBeVisible();
  const saved = page.locator("form").filter({ has: page.locator(`input[value="${zoneSlug}"]`) }).first();
  await saved.getByLabel("Target households (provisional)").fill("5100");
  await saved.getByRole("button", { name: "Save zone", exact: true }).click();
  await expect(saved.getByRole("status")).toHaveText("Zone saved.");
  await form.getByLabel("Zone name").fill(`E2E zone ${zoneSlug}`);
  await form.getByLabel(/^Slug/).fill(zoneSlug);
  await form.getByLabel("Target households (provisional)").fill("5000");
  await form.getByRole("button", { name: "Create zone", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("A zone with this name or slug already exists.");
});

test("each geographic area prepares its own draft without copying dates or inventing quantities", async ({ page }) => {
  await signIn(page);
  test.setTimeout(60_000); // Twenty area/viewport combinations exercise the same existing form.
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const area of REGIONS) {
      await page.goto("/admin/zones");
      const link = page.getByRole("link", { name: `New draft campaign for ${area.name}`, exact: true });
      await link.click();
      await expect(page).toHaveURL(new RegExp(`area=${area.slug}$`));
      await expect(page.getByLabel("Campaign name")).toHaveValue(area.name);
      const selected = page.getByLabel(/^Area/);
      await expect(selected.locator("option:checked")).toHaveText(area.name);
      await expect(page.getByLabel("Mailing month")).toHaveValue("");
      await expect(page.getByLabel("Reservation deadline")).toHaveValue("");
      await expect(page.getByLabel("Artwork submission deadline")).toHaveValue("");
      await expect(page.getByLabel("Square ad per area ($)")).toHaveValue("399");
      if (area.slug !== "central-westchester") await expect(page.getByLabel("Target mailing quantity (homes)")).toHaveValue("");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    }
  }
  await page.goto("/admin/campaigns/new?area=unconfigured-region");
  await expect(page.getByRole("main")).toContainText("This area is not configured.");
  await expect(page.getByRole("button", { name: "Create draft campaign" })).toHaveCount(0);
});

test("January proposal loads exact dates and prices without creating a campaign", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/campaigns/new?draft=central-westchester-2027-01");
  await expect(page.getByLabel("Campaign name")).toHaveValue("Central Westchester — January 2027");
  await expect(page.getByLabel("Mailing month")).toHaveValue("2027-01");
  await expect(page.getByLabel("Reservation deadline")).toHaveValue("2026-12-15T23:59");
  await expect(page.getByLabel("Artwork submission deadline")).toHaveValue("2026-12-20T23:59");
  await expect(page.getByLabel("Mailing window: first day")).toHaveValue("2027-01-11");
  await expect(page.getByLabel("Mailing window: last day")).toHaveValue("2027-01-15");
  await expect(page.getByLabel("Square ad per area ($)")).toHaveValue("399");
  await expect(page.getByLabel("Double price ($)")).toHaveCount(0);
  await expect(page.getByLabel("Target mailing quantity (homes)")).toHaveValue("5000");
});

test("create a draft campaign (with validation), edit it, preserve fixed inventory, cancel it", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/campaigns");
  await page.getByRole("link", { name: "New campaign" }).click();
  await expect(page.getByRole("heading", { name: "New campaign", level: 1 })).toBeVisible();

  await page.getByLabel("Campaign name").fill(name);
  await page.getByLabel("Mailing month").fill(`${year}-03`);
  await page.getByLabel("Target mailing quantity (homes)").fill("5000");
  await page.getByLabel("Reservation deadline").fill(`${year}-02-10T23:59`);
  await page.getByLabel("Artwork submission deadline").fill(`${year}-02-01T23:59`); // before the deadline: invalid
  await page.getByLabel("Mailing window: first day").fill(`${year}-02-20`);
  await page.getByLabel("Mailing window: last day").fill(`${year}-02-25`);
  await page.getByRole("button", { name: "Create draft campaign" }).click();
  await expect(main(page).getByText("Artwork can't be due before the reservation deadline")).toBeVisible();

  await page.getByLabel("Artwork submission deadline").fill(`${year}-02-12T23:59`);
  await page.getByRole("button", { name: "Create draft campaign" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(main(page).getByText("Draft", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("group", { name: "Front of the postcard" })).toBeVisible(); // 16 spaces were created

  // Edit the name.
  await main(page).getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit campaign", level: 1 })).toBeVisible();
  await main(page).getByLabel("Campaign name").fill(`${name} (edited)`); // the visible page (Next keeps the previous one hidden)
  await main(page).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: `${name} (edited)`, level: 1 })).toBeVisible();

  // The square campaign retains ten positions and requires explicit opening.
  await expect(main(page).getByRole("button", { name: "Open for reservations" })).toBeVisible();
  await expect(main(page).getByText("Campaign not open yet")).toBeVisible();

  // Cancel the draft.
  await main(page).getByRole("button", { name: "Cancel campaign" }).click();
  await main(page).getByRole("button", { name: "Cancel campaign" }).last().click();
  await expect(main(page).getByText("Cancelled", { exact: true }).first()).toBeVisible();
});

test("production, payments readiness, artwork queue and new pages render and fit a phone", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/production");
  await page.getByText("Before sending to the printer", {exact:true}).click();
  await expect(main(page).getByText("Printer specifications aren't confirmed")).toBeVisible();
  await page.goto("/admin/payments");
  await page.getByText("Advanced details", {exact:true}).click();
  await expect(main(page).getByText("Fully reserved", { exact: true })).toBeVisible();
  await expect(main(page).getByRole("button", { name: /charge/i })).toHaveCount(0);
  await page.goto("/admin/artwork?filter=approved");
  await expect(page.getByRole("heading", { name: "Artwork", level: 1 })).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["/admin/campaigns/new", "/admin/production", "/admin/payments", "/admin/campaigns/00000000-0000-4000-8000-000000000101"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
