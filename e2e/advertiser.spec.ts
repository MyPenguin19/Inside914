import { randomUUID, createHash } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { localLayoutFixture } from "../tests/integration/local-layout-fixture";
const db = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);
const layout = `test-approved-${randomUUID()}`,
  zone = randomUUID(),
  edition = randomUUID(),
  email = `account-${randomUUID()}@example.com`,
  password = `Local-${randomUUID()}!`;
let booking: string;
const users: string[] = [];
async function emailLink(subject: string) {
  let id = "";
  await expect
    .poll(
      async () => {
        const r = await fetch("http://127.0.0.1:54324/api/v1/messages");
        const data = await r.json();
        const m = data.messages.find(
          (m: { ID: string; Subject: string; To: { Address: string }[] }) =>
            m.To.some((t) => t.Address === email) &&
            m.Subject.toLowerCase().includes(subject),
        );
        id = m?.ID ?? "";
        return !!id;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  const message = await (
    await fetch(`http://127.0.0.1:54324/api/v1/message/${id}`)
  ).json();
  const link = (message.HTML as string).match(
    /href="([^"]*\/auth\/v1\/verify[^\"]*)"/,
  )?.[1];
  expect(link).toBeTruthy();
  return link!.replaceAll("&amp;", "&");
}
async function fits(page: Page, label: string) {
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      `${label} ${width}px`,
    ).toBeLessThanOrEqual(0);
  }
}
test.beforeAll(async () => {
  localLayoutFixture(layout);
  expect(
    (
      await db.from("zones").insert({
        id: zone,
        name: "Account test area",
        slug: `account-${zone}`,
        household_count: 0,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await db.from("editions").insert({
        id: edition,
        zone_id: zone,
        issue_month: "2098-01-01",
        status: "open",
        artwork_deadline: "2097-12-15T23:59:00Z",
        artwork_due_at: "2097-12-20T23:59:00Z",
        unit_price_cents: 50000,
        double_unit_price_cents: 90000,
        layout_template: layout,
      })
    ).error,
  ).toBeNull();
  const { data: s } = await db
    .from("slots")
    .insert({
      edition_id: edition,
      side: "front",
      label: "F1",
      x_in: 0,
      y_in: 0,
      width_in: 3.25,
      height_in: 3,
    })
    .select("id")
    .single();
  const hold = await db
    .rpc("hold_slots", {
      p_slot_ids: [s!.id],
      p_token_hash: createHash("sha256").update(randomUUID()).digest("hex"),
      p_pricing_mode: "test",
      p_unit_price_cents: 100,
      p_double_price_cents: 200,
    })
    .single();
  expect(hold.error).toBeNull();
  booking = hold.data!.booking_id;
  expect(
    (
      await db.from("booking_contacts").insert({
        booking_id: booking,
        business_name: "Account browser test",
        contact_name: "Local Advertiser",
        email,
        phone: "+19145550123",
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await db
        .from("bookings")
        .update({
          status: "reserved",
          reference: `IN914-${randomUUID().replace(/[01-]/g, "A").slice(0, 6).toUpperCase()}`,
          stripe_customer_id: "cus_devtest_account",
          stripe_payment_method_id: "pm_devtest_account",
          confirmed_at: new Date().toISOString(),
          hold_expires_at: null,
        })
        .eq("id", booking)
    ).error,
  ).toBeNull();
});
test.afterAll(async () => {
  const { data: drafts } = await db
    .from("advertiser_artwork_drafts")
    .select("storage_path")
    .eq("booking_id", booking);
  if (drafts?.length)
    await db.storage.from("artwork").remove(drafts.map((d) => d.storage_path));
  await db.from("bookings").delete().eq("id", booking);
  await db.from("editions").delete().eq("id", edition);
  await db.from("zones").delete().eq("id", zone);
  const listed = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const user of listed.data.users)
    if (user.email === email || users.includes(user.id))
      await db.auth.admin.deleteUser(user.id);
  localLayoutFixture(layout, true);
});
test("signup, verified email, dashboard edits, artwork, recovery and cancellation", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/account\/login$/);
  await page.goto("/account/signup");
  await fits(page, "signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("check your email", {
    ignoreCase: true,
  });
  await page.goto(await emailLink("confirm"));
  await expect(
    page.getByRole("heading", { name: "Your advertiser dashboard" }),
  ).toBeVisible({ timeout: 15000 });
  await fits(page, "dashboard");
  await page.getByRole("link", { name: /Manage Account test area/ }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/${booking}$`));
  await fits(page, "reservation");
  await page.getByLabel("Business name").fill("Updated browser business");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status")).toContainText("Details saved");
  await page
    .getByRole("link", { name: "Replace or reposition artwork" })
    .click();
  await expect(
    page.getByRole("heading", { name: /Update artwork/ }),
  ).toBeVisible();
  await fits(page, "artwork");
  const image = await sharp({
    create: { width: 1200, height: 1200, channels: 3, background: "green" },
  })
    .png()
    .toBuffer();
  await page.getByLabel("Ad image file").setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect(page.getByText(/Image uploaded/)).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "Save replacement artwork" }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/${booking}$`));
  await expect(page.getByText("Artwork review: pending")).toBeVisible();
  expect(
    (
      await db
        .from("booking_artwork")
        .select("status,review_status")
        .eq("booking_id", booking)
        .single()
    ).data,
  ).toEqual({ status: "ready", review_status: "pending" });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.goto("/account/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("check your email", {
    ignoreCase: true,
  });
  await page.goto(await emailLink("reset"));
  await expect(page).toHaveURL(/\/account\/reset-password$/);
  const nextPassword = `Next-${randomUUID()}!`;
  await page.getByLabel("Password").fill(nextPassword);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(nextPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/dashboard/${booking}`);
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Cancel this reservation", exact: true })
    .click();
  await expect(page.getByText("cancelled", { exact: true })).toBeVisible();
  expect(
    (await db.from("bookings").select("status").eq("id", booking).single()).data
      ?.status,
  ).toBe("cancelled");
});
test("another advertiser cannot see or edit a reservation, or enter admin", async ({
  page,
}) => {
  const other = `other-${randomUUID()}@example.com`;
  const { data } = await db.auth.admin.createUser({
    email: other,
    password,
    email_confirm: true,
  });
  users.push(data.user!.id);
  await db
    .from("advertiser_email_verifications")
    .insert({ user_id: data.user!.id, verified_email: other });
  await page.goto("/account/login");
  await page.getByLabel("Email").fill(other);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("No confirmed reservations yet.", { exact: false }),
  ).toBeVisible();
  await page.goto(`/dashboard/${booking}`);
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await page.goto(`/dashboard/${booking}/artwork`);
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
});
