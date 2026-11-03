import { deleteLocalCampaignFixtures } from "../tests/integration/local-layout-fixture";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import sharp from "sharp";
import type { Database } from "../src/lib/supabase/database.types";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { openLocalSquareFixtures } from "../tests/integration/local-layout-fixture";
process.loadEnvFile(".env.local");
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL!)) throw new Error("Local stack required");
const db=createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});
const credentials={email:"",password:""};
const ids:string[]=[]; let user:string; let admin:SupabaseClient<Database>;
const names=["Central Westchester","Southern Westchester","Northern Westchester","Eastern Westchester"];
function ok<T>(result:{data:T;error:unknown}) {expect(result.error).toBeNull();return result.data;}
test.beforeAll(async()=>{
  const email=`square-flow-${randomUUID()}@example.com`,password=randomBytes(24).toString("base64url");
  credentials.email=email;credentials.password=password;
  const created=await db.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();user=created.data.user!.id;
  ok(await db.from("admins").insert({user_id:user}));
  admin=createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
  expect((await admin.auth.signInWithPassword({email,password})).error).toBeNull();
  const zones=ok(await db.from("zones").select("id,name").in("name",names))!;
  for(const name of names){
    const id=ok(await admin.rpc("admin_create_square_campaign",{p:{zone_id:zones.find(z=>z.name===name)!.id,name:`Phase C fixture ${name}`,issue_month:"2098-04-01",target_quantity:5000,reservation_deadline:"2098-03-15T23:59:00Z",artwork_due_at:"2098-03-20T23:59:00Z",mailing_window_start:"2098-04-11",mailing_window_end:"2098-04-15",layout_template:name===names[0] ? "amazingmail-9x6-ten-square-draft" : "amazingmail-9x6-v2",unit_price_cents:39900,double_price_cents:null}}));
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
    ok(await db.from("advertiser_invitations").delete().in("edition_id",ids));
    deleteLocalCampaignFixtures(ids);
  }
  if(user){ok(await db.from("admin_events").delete().eq("admin_user_id",user));await admin?.auth.signOut();expect((await db.auth.admin.deleteUser(user)).error).toBeNull();}
});
test("map selection matches cards and works with keyboard and touch-sized layouts", async ({ page }) => {
  await page.goto("/areas");
  const northern = page.getByRole("button", { name: /Northern Westchester on map/ });
  await northern.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("checkbox", { name: /Northern Westchester/ })).toBeChecked();
  await expect(northern).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(page.getByRole("checkbox", { name: /Northern Westchester/ })).not.toBeChecked();
  await page.getByRole("button", { name: /Central Westchester on map/ }).click();
  await page.getByRole("button", { name: /Eastern Westchester on map/ }).click();
  await expect(page.getByText("Total if both campaigns fill: $798", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/area-map-selected-desktop.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({ path: "test-results/area-map-selected-mobile.png", fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByRole("button", { name: /Northern Westchester on map/ }).click();
  await expect(page.getByRole("checkbox", { name: /Northern Westchester/ })).toBeChecked();
});

test("invitation preview uses normal area and position selection without holding inventory",async({page,browser})=>{
  await page.goto("/admin/login");await page.getByLabel("Email").fill(credentials.email);await page.getByLabel("Password").fill(credentials.password);await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("region",{name:"Action needed"})).toBeVisible();
  await page.goto(`/admin/campaigns/${ids[0]}`);await page.getByText("Invite a business",{exact:true}).click();
  await page.getByLabel("Available position",{exact:false}).selectOption({label:"F1"});await page.getByLabel("Business name",{exact:false}).fill("Interested fixture");
  await page.getByRole("button",{name:"Create invitation preview"}).click();await expect(page.getByRole("region",{name:"Invitation preview"})).toBeVisible();
  await expect(page.getByText("Link created. No position was held and no email was sent.")).toBeVisible();
  const link=await page.getByRole("region",{name:"Invitation preview"}).getByRole("link").getAttribute("href");
  expect(ok(await db.from("bookings").select("id").in("edition_id",ids))).toEqual([]);
  const context=await browser.newContext({viewport:{width:375,height:900}}),customer=await context.newPage();
  await customer.goto(link!);await expect(customer.getByRole("checkbox",{name:/Central Westchester/})).toBeChecked();
  await customer.getByRole("button",{name:"Continue with selected areas"}).click();await expect(customer.getByText("Selected: F1.",{exact:false})).toBeVisible();
  expect(await customer.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const invite=ok(await db.from("advertiser_invitations").select("id").eq("edition_id",ids[0]).single())!;
  ok(await db.from("advertiser_invitations").update({expires_at:new Date(0).toISOString()}).eq("id",invite.id));
  await customer.goto(link!);await expect(customer.getByText("This invitation expired or its position is no longer available.",{exact:false})).toBeVisible();
  await context.close();
});

test("mixed V1/V2 areas keep selected positions and separate artwork with one saved card and $0 today", async ({ page, browser }) => {
  test.setTimeout(120000);
  const stripeRequests: string[] = [];
  await page.context().route(/https:\/\/api\.stripe\.com\//, route => { stripeRequests.push(route.request().url()); return route.abort(); });
  await page.goto("/areas");
  const selected = [names[0], names[1], names[3]];
  for (const name of selected) await page.getByRole("checkbox", { name: new RegExp(name) }).check();
  await expect(page.getByText("Total if all selected campaigns fill: $1,197", { exact: true })).toBeVisible();
  await expect(page.getByText("Due today: $0", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue with selected areas" }).click();
  for (const [i, name] of selected.entries()) {
    await page.getByRole("button", {name:`Choose position for ${name}`}).click();
    await page.getByRole("region", { name, exact: true }).getByRole("button", { name: new RegExp(`position ${["F2", "B3", "F6"][i]}:`) }).click();
  }
  await page.getByRole("button",{name:`Choose position for ${names[1]}`}).click();
  const back = page.getByRole("region", {name:names[1],exact:true}).getByRole("group",{name:"Back of the postcard"});
  await expect(back.locator("button")).toHaveCount(4);
  await expect(back.locator('[data-reserved-region="postal"]')).toHaveCount(1);
  await expect(back.locator('[data-reserved-region="house"]')).toHaveCount(1);
  const bounds = await back.locator('[data-slot-label="B3"]').boundingBox();
  expect(bounds!.width/bounds!.height).toBeCloseTo(2.2925/2.815,2);
  await page.screenshot({path:"test-results/postcard-v2/customer-desktop.png",fullPage:true});
  for (const width of [320,375,390,768,1440]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width); }
  await page.setViewportSize({width:375,height:900});
  await page.screenshot({path:"test-results/postcard-v2/customer-mobile.png",fullPage:true});
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Continue to artwork" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Connection interrupted");
  for (const name of selected) { await page.getByRole("button",{name:`Choose position for ${name}`}).click(); await expect(page.getByRole("region", { name, exact: true }).locator('button[aria-pressed="true"]')).toHaveCount(1); }
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "Continue to artwork" }).click();
  await expect(page).toHaveURL(/\/book\/artwork$/);
  await expect(page.getByRole("button",{name:"Choose an image",exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Back to your areas"}).click();
  await expect(page).toHaveURL(/\/book\/cart$/);
  await expect(page.getByRole("region",{name:"Checkout time"})).toContainText(/29:|30:/);
  await page.reload();await expect(page.getByRole("region",{name:"Checkout time"})).toContainText(/29:|30:/);
  const current=ok(await db.from("bookings").select("cart_id").in("edition_id",ids).eq("status","pending"))!;
  const cartId=current[0].cart_id!;
  ok(await db.from("bookings").update({hold_expires_at:new Date(Date.now()+240000).toISOString()}).eq("cart_id",cartId));
  await page.reload();await expect(page.getByRole("button",{name:"Add 15 minutes for all areas"})).toBeVisible();
  await page.context().setOffline(true);await page.getByRole("button",{name:"Add 15 minutes for all areas"}).click();
  await expect(page.getByText("Connection interrupted.",{exact:false})).toBeVisible();await page.context().setOffline(false);
  await page.getByRole("button",{name:"Add 15 minutes for all areas"}).click();await expect(page.getByText("All selected areas now share the extended deadline.")).toBeVisible();
  expect(new Set(ok(await db.from("bookings").select("hold_expires_at").eq("cart_id",cartId))!.map(b=>b.hold_expires_at)).size).toBe(1);
  const extendedExpiry=ok(await db.from("bookings").select("hold_expires_at").eq("cart_id",cartId).limit(1).single())!.hold_expires_at!;
  ok(await db.from("bookings").update({hold_expires_at:new Date(Date.now()+240000).toISOString()}).eq("cart_id",cartId));
  await page.reload();await expect(page.getByRole("region",{name:"Checkout time"})).toContainText(/3:|4:/);
  await expect(page.getByRole("button",{name:"Add 15 minutes for all areas"})).toHaveCount(0);
  ok(await db.from("bookings").update({hold_expires_at:extendedExpiry}).eq("cart_id",cartId));
  await page.reload();
  const other = await browser.newContext(); const second = await other.newPage();
  await second.goto("/areas");
  await second.getByRole("checkbox", { name: /Central Westchester/ }).check();
  await second.getByRole("button", { name: "Continue with selected areas" }).click();
  await expect(second.getByRole("button", { name: /position F2:/ })).toBeDisabled();
  await expect(second.getByRole("button", { name: /position F1:/ })).toBeEnabled();
  await other.close();
  const images: Buffer[] = [];
  for (const [i, name] of selected.entries()) {
    await page.getByRole("button", { name: new RegExp(`(?:Add|Edit) artwork for ${name}$`) }).click();
    await expect(page.getByTestId("artwork-area")).toHaveText(name);
    const buffer = await sharp({ create: { width: 1200, height: 1200, channels: 3, background: { r: 30+i*70, g: 100, b: 160 } } }).png().toBuffer();
    images.push(buffer);
    await page.getByLabel("Ad image file").setInputFiles({ name: `area-${i}.png`, mimeType: "image/png", buffer });
    await page.getByRole("button", { name: "Save artwork and continue" }).click();
    await expect(page).toHaveURL(/\/book\/cart$/);
  }
  await expect(page.getByRole("link", { name: "Continue to business details" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({path:"test-results/simple-artwork-checklist-mobile.png",fullPage:true});
  await page.getByRole("link", { name: "Continue to business details" }).click();
  await expect(page).toHaveURL(/\/book\/cart\/details$/);
  await expect(page.getByLabel("Type of business")).toHaveCount(0);
  await page.getByLabel("Business name").fill("Independent Artwork Fixture");
  await page.getByLabel("Your name").fill("Local Tester");
  await page.getByLabel("Email", { exact: false }).fill("independent@example.com");
  await page.getByLabel("Phone", { exact: false }).fill("9145550123");
  await page.screenshot({path:"test-results/simple-business-mobile.png",fullPage:true});
  await page.getByRole("button", { name: "Continue to save card" }).click();
  await expect(page).toHaveURL(/\/book\/cart\/payment$/);
  await expect(page.getByText("Combined authorized maximum: $1,197", {exact:true})).toBeVisible();
  await expect(page.getByText("Due today: $0.00. No payment is collected today.", {exact:true})).toBeVisible();
  await page.getByText("Review artwork and campaign details",{exact:true}).click();
  for (const summary of await page.getByRole("complementary",{name:"Your order"}).getByText("Campaign details",{exact:true}).all()) await summary.click();
  for (const name of selected) await expect(page.getByRole("region",{name:"Reservation summary"}).getByText(`Phase C fixture ${name}`,{exact:true})).toBeVisible();
  await page.getByText("Review artwork and campaign details",{exact:true}).click();
  const displayedConsent=await page.getByTestId("checkout-consent").textContent();
  expect(displayedConsent).toContain("Inside Diagnostics LLC");
  for (const width of [375,1440]) {
    await page.setViewportSize({width,height:1000});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path:`test-results/legal-checkout-${width}.png`,fullPage:true});
  }

  await page.setViewportSize({width:375,height:1000});
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
  // Account-free private link, mobile requests and safe recovery. No email or Stripe provider calls.
  const accessToken=randomBytes(32).toString("base64url");
  ok(await db.from("booking_access_tokens").insert({booking_id:bookings[0].id,token_hash:createHash("sha256").update(accessToken).digest("hex"),expires_at:new Date(Date.now()+86400000).toISOString()}));
  await page.goto(`/reservation/access#${accessToken}`);await page.getByRole("button",{name:"Open reservation",exact:true}).click();
  await expect(page).toHaveURL(/\/reservation$/);await expect(page.getByRole("heading",{name:"Independent Artwork Fixture"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Your campaign progress"})).toBeVisible();
  await page.getByLabel("Details",{exact:true}).fill("Please help with a replacement image.");await page.getByRole("button",{name:"Submit request"}).click();
  await expect(page.getByText("Request received.",{exact:false})).toBeVisible();
  expect(ok(await db.from("customer_requests").select("kind,status").eq("booking_id",bookings[0].id))).toEqual([{kind:"artwork_change",status:"open"}]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.goto("/reservation/recover");await page.getByLabel("Email",{exact:false}).fill("nobody@example.com");await page.getByLabel("Reservation reference",{exact:false}).fill("IN914-NOBODY");await page.getByRole("button",{name:"Email a private link"}).click();
  await expect(page.getByText("If those details match a reservation",{exact:false})).toBeVisible();
  // Follow the SAME confirmed V2 back placement through admin review and the export API.
  const backBooking=bookings.find(b=>b.edition_id===ids[1])!;
  const adminContext=await browser.newContext();const review=await adminContext.newPage();
  const reviewErrors:string[]=[];
  review.on("pageerror",error=>reviewErrors.push(error.message));
  await review.goto("/admin/login");
  await review.getByLabel("Email").fill(credentials.email);await review.getByLabel("Password").fill(credentials.password);
  await review.getByRole("button",{name:"Sign in",exact:true}).click();await expect(review).toHaveURL(/\/admin$/);
  await review.goto(`/admin/advertisers/${bookings[0].id}`);
  await review.getByRole("button",{name:"Record resolution",exact:true}).click();
  await review.getByLabel("Response to advertiser",{exact:true}).fill("We reviewed your request. Please contact support with the replacement image.");
  await review.getByRole("button",{name:"Confirm",exact:true}).click();
  await expect(review.getByText("Response: We reviewed your request.",{exact:false})).toBeVisible();
  await page.goto("/reservation");
  await expect(page.getByText("artwork change · resolved — We reviewed your request.",{exact:false})).toBeVisible();
  await review.goto(`/admin/artwork/${backBooking.id}`);
  await expect(review.getByText("Printed ad: 2.2925″ × 2.815″")).toBeVisible();
  await expect(review.getByAltText("The advertiser's ad on the postcard")).toBeVisible();
  await expect(review.getByAltText("Original advertiser artwork")).toBeVisible();
  await expect(review.getByRole("note",{name:"Artwork resolution review"})).toContainText("PASS");
  await expect(review.getByText("Saved crop",{exact:true})).toBeVisible();
  await expect(review.getByRole("link",{name:`Phase C fixture ${names[1]}`,exact:true})).toHaveAttribute("href",`/admin/campaigns/${backBooking.edition_id}`);
  const original=review.getByAltText("Original advertiser artwork");
  await expect(original).toHaveJSProperty("naturalWidth",1200);
  for (const width of [375,768,1440]) {
    await review.setViewportSize({width,height:1100});
    expect(await review.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await review.screenshot({path:`test-results/artwork-review-${width}.png`,fullPage:true});
  }
  expect(reviewErrors).toEqual([]);
  const unchanged=ok(await db.from("booking_artwork").select("review_status").eq("booking_id",backBooking.id).single());
  expect(unchanged?.review_status).toBe("pending");
  await review.getByRole("button",{name:"Approve content",exact:true}).click();
  await review.getByRole("button",{name:"Approve",exact:true}).click();
  await expect.poll(async()=>ok(await db.from("booking_artwork").select("review_status").eq("booking_id",backBooking.id).single())?.review_status).toBe("approved");
  const exported=await review.request.post(`/admin/print/${ids[1]}`,{headers:{origin:"http://localhost:3000"},multipart:{side:"back"}});
  expect(exported.status()).toBe(200);expect(exported.headers()["x-postcard-readiness"]).toBe("preview");
  const png=await exported.body();expect(await sharp(png).metadata()).toMatchObject({width:7300,height:4900,density:800});
  const pixel=async(left:number,top:number)=>[...await sharp(png).extract({left,top,width:1,height:1}).removeAlpha().raw().toBuffer()];
  expect(await pixel(1067,3624)).toEqual([100,100,160]); // Southern's original square at B3 center
  expect(await pixel(230,2538)).toEqual([244,242,236]); // neutral contained-image margin, not stretched artwork
  expect(await pixel(5000,3000)).toEqual([255,255,255]); // postal remains blank
  await adminContext.close();
  expect(stripeRequests).toEqual([]);
  expect(ok(await db.from("zone_charges").select("id").in("edition_id", ids))).toHaveLength(0);
  const consents = ok(await db.from("payment_consents").select("amount_cents,terms_version,consent_text").in("booking_id", bookings.map(b => b.id)))!;
  expect(consents).toHaveLength(3); expect(consents.every(c => c.amount_cents === 39900)).toBe(true);
  for (const consent of consents) {expect(consent.terms_version).toBe("square-zones-2026-11-02-reservations-1");expect(consent.consent_text).toBe(displayedConsent);}
});

test("another advertiser can reserve another square in the same area without a category", async ({ page }) => {
  await page.goto("/areas");
  await page.getByRole("checkbox", { name: /Central Westchester/ }).check();
  await page.getByRole("button", { name: "Continue with selected areas" }).click();
  await page.getByRole("button", { name: /position B4:/ }).click();
  await page.getByRole("button", { name: "Continue to artwork" }).click();
  await expect(page).toHaveURL(/\/book\/artwork$/);
  await expect(page.getByRole("button",{name:"Choose an image",exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Back to your areas"}).click();
  await expect(page).toHaveURL(/\/book\/cart$/);
  for (const shade of [80,160]) {
    await page.getByRole("button", { name: /(?:Add|Edit) artwork for Central Westchester$/ }).click();
    const buffer = await sharp({ create: { width: 900, height: 900, channels: 3, background: { r: shade, g: 40, b: 50 } } }).png().toBuffer();
    await page.getByLabel("Ad image file").filter({visible:true}).setInputFiles({ name: "single.png", mimeType: "image/png", buffer });
    await expect(page.getByText(/Image uploaded|Full image preserved/)).toBeVisible();
    await page.getByRole("button", { name: "Save artwork and continue" }).click();
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
  for (const name of [names[1],names[2]]) { await page.getByRole("button",{name:`Choose position for ${name}`}).click(); await page.getByRole("region", { name, exact: true }).getByRole("button", { name: name===names[2] ? /position B4:/ : /position F4:/ }).click(); }
  await page.getByRole("button", { name: "Continue to artwork" }).click();
  await expect(page).toHaveURL(/\/book\/artwork$/);
  await expect(page.getByRole("button",{name:"Choose an image",exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Back to your areas"}).click();
  await expect(page).toHaveURL(/\/book\/cart$/);
  await page.getByRole("button", { name: new RegExp(`(?:Add|Edit) artwork for ${names[1]}$`) }).click();
  const buffer = await sharp({ create: { width: 900, height: 900, channels: 3, background: "purple" } }).png().toBuffer();
  await page.getByLabel("Ad image file").setInputFiles({ name: "copy.png", mimeType: "image/png", buffer });
  await page.getByRole("button", { name: "Save artwork and continue" }).click();
  await expect(page).toHaveURL(/\/book\/cart$/);
  await page.getByRole("button", { name: "Use this image" }).click();
  await expect(page.getByTestId("artwork-area")).toHaveText(names[2]);
  await expect(page.getByAltText("Full artwork fitted without stretching")).toBeVisible();
  await page.getByRole("button", {name:"Fill space",exact:true}).click();
  await expect(page.getByRole("button", {name:"Save artwork and continue"})).toBeDisabled();
  await page.getByRole("checkbox", {name:/I approve this crop/}).check();
  await page.getByRole("button", { name: "Save artwork and continue" }).click();
  await expect(page.getByRole("link", { name: "Continue to business details" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`(?:Add|Edit) artwork for ${names[2]}$`) }).click();
  const changed = await sharp({ create: { width: 900, height: 900, channels: 3, background: "orange" } }).png().toBuffer();
  await page.getByLabel("Ad image file").filter({visible:true}).setInputFiles({ name: "changed.png", mimeType: "image/png", buffer: changed });
  await expect(page.getByText(/Image uploaded|Full image preserved/)).toBeVisible();
  await page.getByRole("button", { name: "Save artwork and continue" }).click();
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
