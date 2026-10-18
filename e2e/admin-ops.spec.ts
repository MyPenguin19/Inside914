import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

// REAL admin UI against the dev project: a throwaway admin (owner-approved) works on a throwaway
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

test.beforeAll(async () => {
  const { data, error } = await service!.auth.admin.createUser({ email: admin.email, password: admin.password, email_confirm: true });
  if (error) throw error;
  admin.id = data.user.id;
  await service!.from("admins").insert({ user_id: admin.id });
});

test.afterAll(async () => {
  const { data } = await service!.from("editions").select("id").like("name", `E2E campaign ${year}%`);
  for (const e of data ?? []) await service!.from("editions").delete().eq("id", e.id);
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

test("create a draft campaign (with validation), edit it, block a space, see the rules enforced, cancel it", async ({ page }) => {
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
  await expect(main(page).getByText("draft", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("group", { name: "Front of the postcard" })).toBeVisible(); // 16 spaces were created

  // Edit the name.
  await main(page).getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit campaign", level: 1 })).toBeVisible();
  await main(page).getByLabel("Campaign name").fill(`${name} (edited)`); // the visible page (Next keeps the previous one hidden)
  await main(page).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: `${name} (edited)`, level: 1 })).toBeVisible();

  // Block a space (reason required), then unblock it.
  const f1 = main(page).getByRole("row").filter({ hasText: "Front F1" });
  await f1.getByRole("button", { name: "Block" }).click();
  await main(page).getByLabel("Reason (internal)").fill("Reserved for an Inside914 notice");
  await main(page).getByRole("button", { name: "Block space" }).click();
  await expect(main(page).getByRole("row").filter({ hasText: "Front F1" })).toContainText("Blocked: Reserved for an Inside914 notice");
  await main(page).getByRole("row").filter({ hasText: "Front F1" }).getByRole("button", { name: "Unblock" }).click();
  await main(page).getByRole("button", { name: "Unblock" }).last().click();
  await expect(main(page).getByRole("row").filter({ hasText: "Front F1" })).not.toContainText("Blocked:");

  // Opening is refused: another Central Westchester campaign is already open (database rule).
  await main(page).getByRole("button", { name: "Open for reservations" }).click();
  await main(page).getByRole("button", { name: "Open now" }).click();
  await expect(main(page).getByText("Another campaign in this area is already open. Close it first.")).toBeVisible();

  // Cancel the draft.
  await main(page).getByRole("button", { name: "Cancel campaign" }).click();
  await main(page).getByRole("button", { name: "Cancel campaign" }).last().click();
  await expect(main(page).getByText("cancelled", { exact: true }).first()).toBeVisible();
});

test("production, payments readiness, artwork queue and new pages render and fit a phone", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/production");
  await expect(page.getByRole("heading", { name: "Production blockers" })).toBeVisible();
  await expect(main(page).getByText("Printer specifications aren't confirmed")).toBeVisible();
  await page.goto("/admin/payments");
  await expect(main(page).getByText("Fully reserved", { exact: true })).toBeVisible();
  await expect(main(page).getByText(/there is no charge button/)).toBeVisible();
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
