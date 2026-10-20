import { randomUUID, randomBytes } from "node:crypto";
import sharp from "sharp";
import type { Database } from "../src/lib/supabase/database.types";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { openLocalSquareFixtures } from "../tests/integration/local-layout-fixture";
process.loadEnvFile(".env.local");
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL!)) throw new Error("Local stack required");
const db=createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});
const ids:string[]=[]; let user:string; let admin:SupabaseClient<Database>;
const names=["Central Westchester","Southern Westchester","Northern Westchester","Eastern Westchester"];
function ok<T>(result:{data:T;error:unknown}) {expect(result.error).toBeNull();return result.data;}
test.beforeAll(async()=>{
  const email=`square-flow-${randomUUID()}@example.com`,password=randomBytes(24).toString("base64url");
  const created=await db.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();user=created.data.user!.id;
  ok(await db.from("admins").insert({user_id:user}));
  admin=createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
  expect((await admin.auth.signInWithPassword({email,password})).error).toBeNull();
  const zones=ok(await db.from("zones").select("id,name").in("name",names))!;
  for(const name of names){
    const id=ok(await admin.rpc("admin_create_square_campaign",{p:{zone_id:zones.find(z=>z.name===name)!.id,name:`Phase C fixture ${name}`,issue_month:"2098-04-01",target_quantity:5000,reservation_deadline:"2098-03-15T23:59:00Z",artwork_due_at:"2098-03-20T23:59:00Z",mailing_window_start:"2098-04-11",mailing_window_end:"2098-04-15",layout_template:"amazingmail-9x6-ten-square-draft",unit_price_cents:39900,double_price_cents:null}}));
    ids.push(id!);
  }
  openLocalSquareFixtures(ids);
});
test.afterAll(async()=>{
  if(ids.length){
    const bookings=ok(await db.from("bookings").select("id,cart_id").in("edition_id",ids))!;
    if(bookings.length){
      const art=ok(await db.from("booking_artwork").select("storage_path").in("booking_id",bookings.map(b=>b.id)))!;
      if(art.length)ok(await db.storage.from("artwork").remove(art.map(a=>a.storage_path)));
      ok(await db.from("bookings").delete().in("edition_id",ids));
      const carts=[...new Set(bookings.map(b=>b.cart_id).filter((id): id is string => !!id))];
      if(carts.length)ok(await db.from("reservation_carts").delete().in("id",carts));
    }
    ok(await db.from("editions").delete().in("id",ids));
  }
  if(user){ok(await db.from("admin_events").delete().eq("admin_user_id",user));await admin?.auth.signOut();expect((await db.auth.admin.deleteUser(user)).error).toBeNull();}
});
test("three areas keep selected squares and separate artwork with one saved card and $0 today", async ({ page, browser }) => {
  test.setTimeout(120000);
  const stripeRequests: string[] = [];
  await page.context().route(/https:\/\/api\.stripe\.com\//, route => { stripeRequests.push(route.request().url()); return route.abort(); });
  await page.goto("/areas");
  const selected = [names[0], names[1], names[3]];
  for (const name of selected) await page.getByRole("checkbox", { name: new RegExp(name) }).check();
  await expect(page.getByText("Maximum authorized total: $1,197", { exact: true })).toBeVisible();
  await expect(page.getByText("Due today: $0", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue with selected areas" }).click();
  for (const [i, name] of selected.entries()) await page.getByRole("region", { name, exact: true }).getByRole("button", { name: new RegExp(`position ${["F2", "B3", "F6"][i]}:`) }).click();
  for (const width of [320,375,390,768,1440]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width); }
  await page.getByRole("button", { name: "Continue to artwork" }).click();
  await expect(page).toHaveURL(/\/book\/cart$/);
  const other = await browser.newContext(); const second = await other.newPage();
  await second.goto("/areas");
  await second.getByRole("checkbox", { name: /Central Westchester/ }).check();
  await second.getByRole("button", { name: "Continue with selected areas" }).click();
  await expect(second.getByRole("button", { name: /position F2:/ })).toBeDisabled();
  await expect(second.getByRole("button", { name: /position F1:/ })).toBeEnabled();
  await other.close();
  const images: Buffer[] = [];
  for (const [i, name] of selected.entries()) {
    await page.getByRole("button", { name: `Edit artwork for ${name}`, exact: true }).click();
    await expect(page.getByTestId("artwork-area")).toHaveText(name);
    const buffer = await sharp({ create: { width: 1200, height: 1200, channels: 3, background: { r: 30+i*70, g: 100, b: 160 } } }).png().toBuffer();
    images.push(buffer);
    await page.getByLabel("Ad image file").setInputFiles({ name: `area-${i}.png`, mimeType: "image/png", buffer });
    await page.getByRole("button", { name: "Save artwork and return to areas" }).click();
    await expect(page).toHaveURL(/\/book\/cart$/);
  }
  await page.getByRole("link", { name: "Continue to business details" }).click();
  await expect(page).toHaveURL(/\/book\/cart\/details$/);
  await expect(page.getByLabel("Type of business")).toHaveCount(0);
  await page.getByLabel("Business name").fill("Independent Artwork Fixture");
  await page.getByLabel("Your name").fill("Local Tester");
  await page.getByLabel("Email", { exact: false }).fill("independent@example.com");
  await page.getByLabel("Phone", { exact: false }).fill("9145550123");
  await page.getByRole("button", { name: "Continue to payment details" }).click();
  await expect(page).toHaveURL(/\/book\/cart\/payment$/);
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByRole("button", { name: /Simulate.*card|Reserve.*TEST|Confirm TEST|Simulate reservation/i })).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Simulate.*card|Reserve.*TEST|Confirm TEST|Simulate reservation/i }).click();
  await expect(page.getByRole("heading", { name: "Your areas are reserved" })).toBeVisible();
  const bookings = ok(await db.from("bookings").select("id,edition_id,status,price_cents,category_id,stripe_setup_intent_id,stripe_payment_method_id,booking_slots(slots(label))").in("edition_id",ids))!;
  expect(bookings).toHaveLength(3);
  expect(bookings.every(b => b.status === "reserved" && b.price_cents === 39900 && b.category_id === null)).toBe(true);
  expect(bookings.filter(b => b.stripe_setup_intent_id)).toHaveLength(1);
  expect(new Set(bookings.map(b => b.stripe_payment_method_id)).size).toBe(1);
  expect(bookings.every(b => b.stripe_payment_method_id?.startsWith("pm_devtest_"))).toBe(true);
  for (const [i, name] of selected.entries()) {
    const b = bookings.find(b => b.edition_id === ids[names.indexOf(name)])!;
    expect(b.booking_slots[0].slots?.label).toBe(["F2", "B3", "F6"][i]);
    const a = ok(await db.from("booking_artwork").select("storage_path,crop_width,crop_height").eq("booking_id", b.id).single())!;
    expect(Math.abs(a.crop_width!-a.crop_height!)).toBeLessThanOrEqual(1);
    const downloaded = await db.storage.from("artwork").download(a.storage_path);
    expect(downloaded.error).toBeNull(); expect(Buffer.from(await downloaded.data!.arrayBuffer()).equals(images[i])).toBe(true);
  }
  expect(stripeRequests).toEqual([]);
  expect(ok(await db.from("zone_charges").select("id").in("edition_id", ids))).toHaveLength(0);
  const consents = ok(await db.from("payment_consents").select("amount_cents").in("booking_id", bookings.map(b => b.id)))!;
  expect(consents).toHaveLength(3); expect(consents.every(c => c.amount_cents === 39900)).toBe(true);
});

test("another advertiser can reserve another square in the same area without a category", async ({ page }) => {
  await page.goto("/areas");
  await page.getByRole("checkbox", { name: /Central Westchester/ }).check();
  await page.getByRole("button", { name: "Continue with selected areas" }).click();
  await page.getByRole("button", { name: /position B4:/ }).click();
  await page.getByRole("button", { name: "Continue to artwork" }).click();
  await expect(page).toHaveURL(/\/book\/cart$/);
  for (const shade of [80,160]) {
    await page.getByRole("button", { name: "Edit artwork for Central Westchester", exact: true }).click();
    const buffer = await sharp({ create: { width: 900, height: 900, channels: 3, background: { r: shade, g: 40, b: 50 } } }).png().toBuffer();
    await page.getByLabel("Ad image file").filter({visible:true}).setInputFiles({ name: "single.png", mimeType: "image/png", buffer });
    await expect(page.getByText("Image uploaded. Drag it and zoom until it looks right.")).toBeVisible();
    await page.getByRole("button", { name: "Save artwork and return to areas" }).click();
    await expect(page.getByRole("link", { name: "Continue to business details" })).toBeVisible();
  }
  await page.getByRole("button", { name: "Release all areas and change selection" }).click();
  await expect(page).toHaveURL(/\/book\/multi$/);
});

test("copied artwork can be edited independently in another area", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/areas");
  for (const name of [names[1],names[2]]) await page.getByRole("checkbox", { name: new RegExp(name) }).check();
  await page.getByRole("button", { name: "Continue with selected areas" }).click();
  for (const name of [names[1],names[2]]) await page.getByRole("region", { name, exact: true }).getByRole("button", { name: /position F4:/ }).click();
  await page.getByRole("button", { name: "Continue to artwork" }).click();
  await expect(page).toHaveURL(/\/book\/cart$/);
  await page.getByRole("button", { name: `Edit artwork for ${names[1]}`, exact: true }).click();
  const buffer = await sharp({ create: { width: 900, height: 900, channels: 3, background: "purple" } }).png().toBuffer();
  await page.getByLabel("Ad image file").setInputFiles({ name: "copy.png", mimeType: "image/png", buffer });
  await page.getByRole("button", { name: "Save artwork and return to areas" }).click();
  await expect(page).toHaveURL(/\/book\/cart$/);
  await page.getByRole("button", { name: "Copy image and position for this area" }).click();
  await expect(page.getByTestId("artwork-area")).toHaveText(names[2]);
  await page.getByRole("button", { name: "Save artwork and return to areas" }).click();
  await expect(page.getByRole("link", { name: "Continue to business details" })).toBeVisible();
  await page.getByRole("button", { name: `Edit artwork for ${names[2]}`, exact: true }).click();
  const changed = await sharp({ create: { width: 900, height: 900, channels: 3, background: "orange" } }).png().toBuffer();
  await page.getByLabel("Ad image file").filter({visible:true}).setInputFiles({ name: "changed.png", mimeType: "image/png", buffer: changed });
  await expect(page.getByText("Image uploaded. Drag it and zoom until it looks right.")).toBeVisible();
  await page.getByRole("button", { name: "Save artwork and return to areas" }).click();
  await expect(page).toHaveURL(/\/book\/cart$/);
  const bookings = ok(await db.from("bookings").select("id,edition_id").in("edition_id", [ids[1],ids[2]]).eq("status", "pending"))!;
  expect(bookings).toHaveLength(2);
  for (const b of bookings) {
    const artwork = ok(await db.from("booking_artwork").select("storage_path").eq("booking_id",b.id).single())!;
    const downloaded = await db.storage.from("artwork").download(artwork.storage_path);
    expect(downloaded.error).toBeNull();
    expect(Buffer.from(await downloaded.data!.arrayBuffer()).equals(b.edition_id === ids[1] ? buffer : changed)).toBe(true);
  }
  await page.getByRole("button", { name: "Release all areas and change selection" }).click();
});
