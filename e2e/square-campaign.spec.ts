import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url)) throw new Error("Square campaign tests require local Supabase");
const db = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const zone = randomUUID();
const email = `square-e2e-${randomUUID()}@example.com`;
const password = randomBytes(24).toString("base64url");
let user: string;
function ok<T>(r: { data: T; error: unknown }) { expect(r.error).toBeNull(); return r.data; }

test.beforeAll(async () => {
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  user = created.data.user!.id;
  ok(await db.from("admins").insert({ user_id: user }));
  ok(await db.from("zones").insert({ id: zone, name: `Square fixture ${zone}`, slug: `square-e2e-${zone}`, household_count: 5000 }));
});
test.afterAll(async () => {
  ok(await db.from("editions").delete().eq("zone_id", zone));
  ok(await db.from("zones").delete().eq("id", zone));
  if (user) {
    ok(await db.from("admin_events").delete().eq("admin_user_id", user));
    expect((await db.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("admin creates a $399 ten-square draft; form and inventory fit mobile through desktop", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", {name:"Manage Inside914"})).toBeVisible();
  await page.goto(`/admin/campaigns/new?area=square-e2e-${zone}`);
  const price = page.getByLabel("Square ad per area ($)", { exact: false });
  await expect(price).toHaveValue("399");
  await expect(price).toHaveAttribute("readonly", "");
  await expect(page.getByLabel("Double price", { exact: false })).toHaveCount(0);
  await expect(page.locator("#layout_template option")).toHaveCount(1);
  await page.getByLabel("Campaign name").fill("Square E2E draft");
  await page.getByLabel("Mailing month").fill("2098-01");
  await page.getByLabel("Target mailing quantity", { exact: false }).fill("5000");
  await page.locator("#reservation_deadline").fill("2097-12-15T23:59");
  await page.getByLabel("Artwork submission deadline").fill("2097-12-20T23:59");
  await page.getByLabel("Mailing window: first day").fill("2098-01-11");
  await page.getByLabel("Mailing window: last day").fill("2098-01-15");
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `form at ${width}`).toBeLessThanOrEqual(width);
  }
  await page.getByRole("button", { name: "Create draft campaign" }).click();
  await expect(page).toHaveURL(/\/admin\/campaigns\/[a-f0-9-]{36}$/);
  await page.getByText("Campaign dates and details", {exact:true}).click();
  await expect(page.getByText("$399 square ad per area · 10 paid positions", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Front of the postcard" }).locator("button")).toHaveCount(6);
  await expect(page.getByRole("group", { name: "Back of the postcard" }).locator("button")).toHaveCount(4);
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `inventory at ${width}`).toBeLessThanOrEqual(width);
  }
  const campaign = ok(await db.from("editions").select("id,status,product_model,unit_price_cents,double_unit_price_cents").eq("zone_id", zone).single());
  expect(campaign).toMatchObject({ status: "draft", product_model: "square_v1", unit_price_cents: 39900, double_unit_price_cents: null });
  expect(ok(await db.from("slots").select("id").eq("edition_id", campaign!.id))).toHaveLength(10);
  await expect(page.getByRole("link", {name:"Review payments"})).toBeVisible();
  await expect(page.getByText("0 of 10 valid confirmed reservations", {exact:true})).toBeVisible();
  await expect(page.getByText("Layout approved. Open this campaign when you're ready to accept reservations.")).toBeVisible();
  await expect(page.getByText("10 total positions", {exact:true})).toBeVisible();
  await page.getByRole("button", {name:"Open for reservations", exact:true}).click();
  expect(ok(await db.from("editions").select("status").eq("id",campaign!.id).single())!.status).toBe("draft");
  await page.getByRole("button", {name:"Open now", exact:true}).click();
  await expect(page.getByRole("button", {name:"Pause new reservations", exact:true})).toBeVisible();
  expect(ok(await db.from("editions").select("status").eq("id",campaign!.id).single())!.status).toBe("open");
  expect(ok(await db.from("slot_availability").select("slot_id").eq("edition_id",campaign!.id).eq("available",true))).toHaveLength(10);
  await page.goto(`/admin/production?campaign=${campaign!.id}`);
  await expect(page.getByText("Inside914 · House artwork pending", {exact:true})).toBeVisible();
  await expect(page.getByText("Inside Diagnostics · House artwork pending", {exact:true})).toBeVisible();
  await expect(page.getByText("Postal exclusion · No advertising", {exact:true})).toBeVisible();
  await page.getByRole("button", {name:"Download front"}).click();
  await expect(page.getByText("All 10 paid positions must be reserved before downloading the complete postcard.")).toBeVisible();
  for (const width of [320,375,390,768,1440]) {
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth), `production at ${width}`).toBeLessThanOrEqual(width);
  }
  const front = page.getByRole("img", {name:"Assembled front of the postcard (not a print proof)"});
  await front.scrollIntoViewIfNeeded();
  expect((await front.boundingBox())!.height).toBeGreaterThan(100);
  await expect(front.getByText("F1 unsold", {exact:true})).toBeVisible();
  await page.screenshot({path:"../../outputs/inside914-phase-f-production.png",fullPage:true});
  await page.goto("/pay/"+"x".repeat(43));
  await expect(page).toHaveURL(/\/pay\?invalid=1$/);
  await expect(page.getByRole("heading",{name:"Payment link unavailable"})).toBeVisible();
  expect(errors).toEqual([]);
});
