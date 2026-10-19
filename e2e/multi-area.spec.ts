import { randomUUID, randomBytes } from "node:crypto";
import sharp from "sharp";
import type { Database } from "../src/lib/supabase/database.types";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { openLocalSquareFixtures } from "../tests/integration/local-layout-fixture";
process.loadEnvFile(".env.local");
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL!)) throw new Error("Local stack required");
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});
let adminEmail: string, adminPassword: string;
const ids:string[]=[]; let user:string; let admin:SupabaseClient<Database>;
const names=["Central Westchester","Southern Westchester","Northern Westchester","Eastern Westchester"];
function ok<T>(result:{data:T;error:unknown}) {expect(result.error).toBeNull();return result.data;}
test.beforeAll(async()=>{
  const email=`square-flow-${randomUUID()}@example.com`,password=randomBytes(24).toString("base64url");
  adminEmail=email;adminPassword=password;
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
      const carts=[...new Set(bookings.map(b=>b.cart_id).filter(Boolean))];
      if(carts.length)ok(await db.from("reservation_carts").delete().in("id",carts));
    }
    ok(await db.from("editions").delete().in("id",ids));
  }
  if(user){ok(await db.from("admin_events").delete().eq("admin_user_id",user));await admin?.auth.signOut();expect((await db.auth.admin.deleteUser(user)).error).toBeNull();}
});
test("category-first four-zone checkout uses one square artwork and one simulated setup",async({page,browser})=>{
  test.setTimeout(60000);
  await page.goto("/areas");
  await expect(page.getByRole("link",{name:"Account",exact:true})).toHaveCount(0);
  await page.getByLabel("Choose your business category").selectOption("plumbing");
  for(const name of names.slice(0,2))await page.getByRole("checkbox",{name:new RegExp(name)}).check();
  await expect(page.getByText("Maximum authorized total: $798",{exact:true})).toBeVisible();
  for(const name of names.slice(2))await page.getByRole("checkbox",{name:new RegExp(name)}).check();
  await expect(page.getByText("Maximum authorized total: $1,596",{exact:true})).toBeVisible();
  await expect(page.getByText("Due today: $0",{exact:true})).toBeVisible();
  for(const width of [320,375,390,768,1440]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
  await page.getByRole("button",{name:"Continue with selected zones"}).click();
  await expect(page).toHaveURL(/\/book\/cart$/);
  await expect(page.getByText("Category: Plumbing",{exact:true})).toBeVisible();
  // Separate visitor sees exclusive category occupancy, without customer identity.
  const other=await browser.newContext(); const second=await other.newPage();
  await second.goto("/areas");await second.getByLabel("Choose your business category").selectOption("plumbing");
  for(const name of names)await expect(second.getByRole("checkbox",{name:new RegExp(name)})).toBeDisabled();
  await second.getByLabel("Choose your business category").selectOption("hvac");
  await expect(second.getByRole("checkbox",{name:/Central Westchester/})).toBeEnabled();await other.close();
  await page.getByRole("button",{name:"Upload or edit shared artwork"}).click();
  await expect(page).toHaveURL(/\/book\/artwork$/);
  const image=await sharp({create:{width:1200,height:900,channels:3,background:{r:40,g:100,b:160}}}).png().toBuffer();
  await page.getByLabel("Ad image file").setInputFiles({name:"shared.png",mimeType:"image/png",buffer:image});
  await expect(page.getByRole("button",{name:"Save artwork for all zones"})).toBeEnabled();
  await page.getByRole("button",{name:"Save artwork for all zones"}).click();
  await expect(page).toHaveURL(/\/book\/cart$/);
  await expect(page.getByText("Shared artwork ready for all zones.")).toBeVisible();
  await page.getByLabel("Business name").fill("Shared Square Fixture");
  await page.getByLabel("Your name").fill("Local Tester");
  await page.getByLabel("Email",{exact:false}).fill("shared-square@example.com");
  await page.getByLabel("Phone",{exact:false}).fill("9145550123");
  await page.getByRole("button",{name:"Continue to payment details"}).click();
  await expect(page).toHaveURL(/\/book\/cart\/payment$/);
  await page.getByRole("checkbox").check();
  await page.getByRole("button",{name:/Simulate.*card|Reserve.*TEST|Confirm TEST|Simulate reservation/i}).click();
  await expect(page.getByRole("heading",{name:"Your areas are reserved"})).toBeVisible();
  const bookings=ok(await db.from("bookings").select("id,status,price_cents,category_id,stripe_setup_intent_id,stripe_payment_method_id").in("edition_id",ids))!;
  expect(bookings).toHaveLength(4);expect(bookings.every(b=>b.status==="reserved"&&b.price_cents===39900&&b.category_id==="plumbing")).toBe(true);
  expect(bookings.filter(b=>b.stripe_setup_intent_id)).toHaveLength(1);
  expect(new Set(bookings.map(b=>b.stripe_payment_method_id)).size).toBe(1);
  const art=ok(await db.from("booking_artwork").select("shared_source_id,crop_x,crop_y,crop_width,crop_height,zoom,storage_path").in("booking_id",bookings.map(b=>b.id)))!;
  expect(new Set(art.map(a=>a.shared_source_id)).size).toBe(1);expect(art[0].shared_source_id).toBeTruthy();
  expect(new Set(art.map(a=>JSON.stringify([a.crop_x,a.crop_y,a.crop_width,a.crop_height,a.zoom]))).size).toBe(1);
  expect(art.every(a=>Math.abs(a.crop_width-a.crop_height)<=1)).toBe(true);
  for (const a of art) {
    const downloaded=await db.storage.from("artwork").download(a.storage_path);
    expect(downloaded.error).toBeNull();
    expect(Buffer.from(await downloaded.data!.arrayBuffer()).equals(image)).toBe(true);
  }
  const consents=ok(await db.from("payment_consents").select("amount_cents,stripe_setup_intent_id").in("booking_id",bookings.map(b=>b.id)))!;
  expect(consents).toHaveLength(4);expect(consents.every(c=>c.amount_cents===39900)).toBe(true);
  const reviewer=await browser.newContext();const reviewPage=await reviewer.newPage();
  await reviewPage.goto("/admin/login");
  await reviewPage.getByLabel("Email").fill(adminEmail);await reviewPage.getByLabel("Password").fill(adminPassword);
  await reviewPage.getByRole("button",{name:"Sign in"}).click();await expect(reviewPage).toHaveURL(/\/admin$/);
  await reviewPage.goto("/admin/advertisers?q=Shared%20Square%20Fixture");
  await expect(reviewPage.getByRole("columnheader",{name:"Category",exact:true})).toBeVisible();
  const reservationRows=reviewPage.getByRole("row").filter({hasText:"Shared Square Fixture"});
  await expect(reservationRows).toHaveCount(4);
  for (const row of await reservationRows.all()) {
    await expect(row).toContainText("plumbing");
    const selected=row.getByRole("cell").nth(2);
    for (const name of names) await expect(selected).toContainText(name);
  }
  await reviewPage.goto("/admin/payments?q=Shared%20Square%20Fixture");
  await expect(reviewPage.getByRole("row").filter({hasText:"Shared Square Fixture"})).toHaveCount(4);
  await expect(reviewPage.getByRole("columnheader",{name:"Collection status",exact:true})).toBeVisible();
  await reviewer.close();
  for(const path of ["/account/signup","/account/login","/account/reset-password","/dashboard","/dashboard/recurring"]){await page.goto(path);await expect(page).toHaveURL(/\/areas$/);}
});

test("one-zone checkout can replace its shared image without requiring another upload",async({page})=>{
  await page.goto("/areas");
  await page.getByLabel("Choose your business category").selectOption("hvac");
  await page.getByRole("checkbox",{name:/Central Westchester/}).check();
  await page.getByRole("button",{name:"Continue with selected zones"}).click();
  await expect(page).toHaveURL(/\/book\/cart$/);
  for(const shade of [80,160]){
    await page.getByRole("button",{name:"Upload or edit shared artwork"}).click();
    await expect(page).toHaveURL(/\/book\/artwork$/);
    const buffer=await sharp({create:{width:900,height:900,channels:3,background:{r:shade,g:40,b:50}}}).png().toBuffer();
    await page.getByLabel("Ad image file").filter({visible:true}).setInputFiles({name:"single.png",mimeType:"image/png",buffer});
    await expect(page.getByText("Image uploaded. Drag it and zoom until it looks right.")).toBeVisible();
    await expect(page.getByRole("button",{name:"Save artwork for all zones"})).toBeEnabled();
    await page.getByRole("button",{name:"Save artwork for all zones"}).click();
    await expect(page).toHaveURL(/\/book\/cart$/);
    await expect(page.getByText("Shared artwork ready for all zones.")).toBeVisible();
    const booking=ok(await db.from("bookings").select("id").eq("edition_id",ids[0]).eq("category_id","hvac").single())!;
    const artwork=ok(await db.from("booking_artwork").select("storage_path,shared_source_id").eq("booking_id",booking.id).single())!;
    expect(artwork.shared_source_id).toBeTruthy();
    const downloaded=await db.storage.from("artwork").download(artwork.storage_path);
    expect(downloaded.error).toBeNull();
    expect(Buffer.from(await downloaded.data!.arrayBuffer()).equals(buffer)).toBe(true);
  }
  await page.getByRole("button",{name:"Release all areas and change selection"}).click();
  await expect(page).toHaveURL(/\/book\/multi$/);
});
