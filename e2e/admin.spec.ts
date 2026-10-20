import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

// REAL Supabase Auth on the LOCAL stack: throwaway admin and non-admin users (approved by the
// owner), created for this file and deleted afterwards.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
test.skip(!url || !secret, "needs the dev Supabase project in .env.local");

const service = url && secret ? createClient(url, secret, { auth: { persistSession: false } }) : null;
const users: { id: string; email: string; password: string }[] = [];

async function makeUser(admin: boolean) {
  const email = `inside914-e2e-${admin ? "admin" : "user"}-${randomUUID()}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const { data, error } = await service!.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  if (admin) await service!.from("admins").insert({ user_id: data.user.id });
  const user = { id: data.user.id, email, password };
  users.push(user);
  return user;
}

let admin: { email: string; password: string };
let member: { email: string; password: string };

test.beforeAll(async () => {
  admin = await makeUser(true);
  member = await makeUser(false);
});

test.afterAll(async () => {
  for (const u of users) await service?.auth.admin.deleteUser(u.id);
});

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto("/admin/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("signed out: every admin page sends you to the login page", async ({ page }) => {
  const download = await page.request.post("/admin/print/00000000-0000-4000-8000-000000000101", { maxRedirects: 0 });
  expect([303,307]).toContain(download.status());
  expect(download.headers().location).toContain("/admin/login");
  for(const method of ["get","post"] as const) {
    const house=await page.request[method]("/admin/house-artwork", {maxRedirects:0});
    expect([303,307]).toContain(house.status());
  }
  for (const path of ["/admin/zones", "/admin/campaigns/new?draft=central-westchester-2027-01", "/admin", "/admin/advertisers", "/admin/payments", "/admin/settings", "/admin/campaigns/00000000-0000-4000-8000-000000000101"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/admin\/login$/);
  }
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText(/sign up|create account/i)).toHaveCount(0); // no public registration
});

test("wrong password and non-admin accounts are refused with the same message", async ({ page }) => {
  await signIn(page, { email: admin.email, password: "wrong-password" });
  await expect(page.locator("main").getByRole("alert")).toContainText("don't match an admin account");
  await signIn(page, member);
  await expect(page.locator("main").getByRole("alert")).toContainText("don't match an admin account");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/); // the non-admin was signed out again
});

test("an admin signs in, sees real data in every section, and signs out", async ({ page }) => {
  await signIn(page, admin);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Manage Inside914", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1. Campaigns" })).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Admin" });
  for (const [link, heading] of [
    ["Campaigns", "Campaigns"],
    ["Advertisers", "Advertisers"],
    ["Artwork Approval", "Artwork"],
    ["Payments", "Payments"],
    ["Settings", "Settings"],
  ]) {
    await nav.getByRole("link", { name: link }).click();
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  }
  await page.getByText("Advanced configuration", {exact:true}).click();
  await expect(page.getByRole("main")).toContainText("Supabase"); // status rows stream in after the heading
  const settings = await page.getByRole("main").innerText(); // the visible page (Next keeps the previous one hidden)
  expect(settings).toMatch(/Supabase\s+Connected/);
  expect(settings).not.toMatch(/sk_(test|live)_|pk_(test|live)_|whsec_|sb_secret_/); // never a secret value

  await page.goto("/admin/campaigns");
  await page.getByRole("link", { name: "Central Westchester" }).first().click();
  await expect(page.getByRole("group", { name: "Front of the postcard" })).toBeVisible(); // reused postcard

  // Keyboard, not a click: in dev, Next's corner badge sits over the sidebar's bottom-left button.
  await page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("admin pages fit a phone screen", async ({ page }) => {
  await signIn(page, admin);
  await expect(page.getByRole("heading", { name: "Manage Inside914", level: 1 })).toBeVisible();
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/admin/zones", "/admin/campaigns/new?draft=central-westchester-2027-01", "/admin", "/admin/campaigns", "/admin/campaigns/00000000-0000-4000-8000-000000000101", "/admin/advertisers", "/admin/artwork", "/admin/payments", "/admin/settings"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (path === "/admin/zones") await expect(page.getByRole("button", { name: "Create zone", exact: true })).toBeVisible();
      if (path.startsWith("/admin/campaigns/new")) await expect(page.getByLabel("Reservation deadline")).toHaveValue("2026-12-15T23:59");
      // Payments streams its readiness card after the heading; measure the complete form.
      if (path === "/admin/payments") await expect(page.getByLabel("Campaign", { exact: true })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }

    // The mobile nav scrolls within its own row; the selector and submit remain usable.
    const payments = page.getByRole("navigation", { name: "Admin", exact: true }).getByRole("link", { name: "Payments", exact: true });
    await payments.scrollIntoViewIfNeeded();
    await payments.click();
    const campaign = page.getByLabel("Campaign", { exact: true });
    await expect(campaign).toBeVisible();
    const value = await campaign.locator("option").last().getAttribute("value");
    await campaign.selectOption(value!);
    await page.getByRole("button", { name: "Show", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`campaign=${value}`));
    await expect(campaign).toHaveValue(value!);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `campaign form at ${width}px`).toBeLessThanOrEqual(0);
  }
});
