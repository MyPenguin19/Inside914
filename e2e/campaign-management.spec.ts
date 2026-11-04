import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
import { deleteLocalCampaignFixtures } from "../tests/integration/local-layout-fixture";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url)) throw new Error("Local Supabase required");
const db=createClient(url,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});
const admin=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
const zone=randomUUID(),email=`management-${randomUUID()}@example.com`,password=randomBytes(24).toString("hex");
let user:string;const campaigns:string[]=[];
const ok=<T>(r:{data:T;error:unknown})=>{expect(r.error).toBeNull();return r.data;};
test.use({trace:"retain-on-failure",screenshot:"only-on-failure"});
test.beforeAll(async()=>{
 const created=await db.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();user=created.data.user!.id;
 ok(await db.from("admins").insert({user_id:user}));
 ok(await db.from("zones").insert({id:zone,name:`Campaign management ${zone}`,slug:`management-${zone}`,household_count:5000}));
 expect((await admin.auth.signInWithPassword({email,password})).error).toBeNull();
});
test.afterAll(async()=>{
 deleteLocalCampaignFixtures(campaigns);
 ok(await db.from("zones").delete().eq("id",zone));
 ok(await db.from("admin_events").delete().eq("admin_user_id",user));
 await admin.auth.signOut();expect((await db.auth.admin.deleteUser(user)).error).toBeNull();
});
async function signIn(page:Page){
 await page.goto("/admin/login", {waitUntil:"networkidle"});await page.getByLabel("Email").fill(email);await page.getByLabel("Password").fill(password);
 await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page).toHaveURL(/\/admin$/);
}

test("custom pricing, explicit upgrade, consistent export, archive and guarded deletion",async({page})=>{
 test.setTimeout(120000);
 page.setDefaultTimeout(15000);
 const stripeRequests:string[]=[];page.on("request",r=>{if(/stripe\.com/.test(r.url()))stripeRequests.push(r.url());});
 await signIn(page);
 await page.goto(`/admin/campaigns/new?area=management-${zone}`);
 await page.getByLabel("Campaign name").fill("Management draft");
 await page.getByLabel("Mailing month").fill("2098-01");
 await page.getByLabel("Target mailing quantity (homes)").fill("5000");
 await page.getByLabel("Reservation deadline").fill("2097-12-15T23:59");
 await page.getByLabel("Artwork submission deadline").fill("2097-12-20T23:59");
 await page.getByLabel("Mailing window: first day").fill("2098-01-11");
 await page.getByLabel("Mailing window: last day").fill("2098-01-15");
 await page.getByLabel("Price per advertising position ($)").fill("449");
 await page.getByRole("button",{name:"Create draft campaign"}).click();
 await expect(page).toHaveURL(/\/admin\/campaigns\/[a-f0-9-]{36}$/);
 const created=page.url().split("/").at(-1)!;campaigns.push(created);
 expect(ok(await db.from("editions").select("status,unit_price_cents").eq("id",created).single())).toMatchObject({status:"draft",unit_price_cents:44900});
 await page.getByRole("link",{name:"Edit",exact:true}).click();
 await expect(page).toHaveURL(new RegExp(`/admin/campaigns/${created}/edit$`));
 await expect(page.getByRole("heading",{name:"Edit campaign",level:1})).toBeVisible();
 await page.getByRole("textbox",{name:"Price per advertising position ($)"}).fill("299.50");
 await page.getByRole("button",{name:"Save changes"}).click();
 await expect(page).toHaveURL(new RegExp(`/admin/campaigns/${created}$`));
 expect(ok(await db.from("editions").select("unit_price_cents").eq("id",created).single())!.unit_price_cents).toBe(29950);
 await page.getByRole("navigation",{name:"Campaign workspace"}).getByRole("link",{name:"Campaign settings",exact:true}).click();
 await page.getByText("Archive, delete or change layout",{exact:true}).click();
 await page.getByRole("button",{name:"Delete campaign",exact:true}).click();
 await expect(page.getByRole("dialog")).toContainText("cannot be undone");
 expect(ok(await db.from("editions").select("id").eq("id",created))).toHaveLength(1);
 await page.getByLabel("Type DELETE CAMPAIGN to confirm").fill("DELETE CAMPAIGN");
 await page.getByRole("button",{name:"Permanently delete"}).click();await expect(page).toHaveURL(/\/admin\/campaigns$/);
 expect(ok(await db.from("editions").select("id").eq("id",created))).toHaveLength(0);
 const v1=ok(await admin.rpc("admin_create_square_campaign",{p:{zone_id:zone,name:`V1 management ${zone}`,issue_month:"2098-02-01",target_quantity:5000,reservation_deadline:"2097-12-15T23:59:00Z",artwork_due_at:"2097-12-20T23:59:00Z",mailing_window_start:"2098-02-11",mailing_window_end:"2098-02-15",layout_template:"amazingmail-9x6-ten-square-draft",unit_price_cents:44900,double_price_cents:null}}))! as string;campaigns.push(v1);
 const before=ok(await db.from("slots").select("id,label").eq("edition_id",v1).order("label"));
 await page.goto(`/admin/campaigns/${v1}?view=settings`);
 await page.getByText("Archive, delete or change layout",{exact:true}).click();
 await expect(page.locator(`[data-campaign-id="${v1}"]`)).toContainText("Layout: V1");
 await page.getByText("Upgrade this V1 campaign to V2",{exact:true}).click();
 await page.getByRole("button",{name:"Preview upgrade (no changes)"}).click();
 await expect(page.getByText("All ten positions can be mapped safely.")).toBeVisible();
 expect(ok(await db.from("editions").select("layout_template").eq("id",v1).single())!.layout_template).toBe("amazingmail-9x6-ten-square-draft");
 await page.getByRole("button",{name:"Upgrade layout to V2",exact:true}).click();
 await page.getByLabel("Type UPGRADE TO V2 to confirm").fill("UPGRADE TO V2");
 await page.getByRole("button",{name:"Confirm V2 upgrade"}).click();
 await expect(page.locator(`[data-campaign-id="${v1}"]`)).toContainText("Layout: V2");
 expect(ok(await db.from("slots").select("id,label").eq("edition_id",v1).order("label"))).toEqual(before);
 await page.getByRole("navigation",{name:"Campaign workspace"}).getByRole("link",{name:"Overview",exact:true}).click();
 for(const width of [320,375,390,768,1440]){
  await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  if (width === 375 || width === 1440) {
   for (const side of ["Front", "Back"]) {
    const map = page.getByRole("group", {name:`${side} of the postcard`,exact:true});
    await expect(map.locator("[data-slot-label]")).toHaveCount(side === "Front" ? 6 : 4);
    await map.screenshot({path:`test-results/campaign-${side}-${width}.png`});
   }
   await page.evaluate(() => window.scrollTo(0, 0));
   await page.screenshot({path:`test-results/campaign-management-${width}.png`,fullPage:true});
  }
 }
 for(const side of ["front","back"]){
  const response=await page.request.post(`/admin/print/${v1}`,{headers:{origin:"http://localhost:3000"},multipart:{side}});
  expect(response.status()).toBe(200);expect(response.headers()["x-campaign-id"]).toBe(v1);expect(response.headers()["x-layout-key"]).toBe("amazingmail-9x6-v2");
  expect(await sharp(await response.body()).metadata()).toMatchObject({width:7300,height:4900,density:800});
 }
 // No reservations: normal cancellation has no customer notifications or card cleanup to perform.
 await page.getByRole("button",{name:"Cancel campaign",exact:true}).click();await page.getByRole("button",{name:"Cancel campaign",exact:true}).last().click();
 await page.getByRole("navigation",{name:"Campaign workspace"}).getByRole("link",{name:"Campaign settings",exact:true}).click();
 await page.getByText("Archive, delete or change layout",{exact:true}).click();
 await expect(page.getByRole("button",{name:"Archive campaign",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Archive campaign",exact:true}).click();
 await page.getByLabel("Type ARCHIVE CAMPAIGN to confirm").fill("ARCHIVE CAMPAIGN");await page.getByRole("button",{name:"Archive",exact:true}).click();
 await expect(page.getByText("Archived. Reservation, artwork, payment and mailing records are preserved.")).toBeVisible();
 await page.goto("/admin/campaigns");await expect(page.getByRole("link",{name:new RegExp(`V1 management ${zone}`)})).toHaveCount(0);
 await page.getByRole("link",{name:"Archived",exact:true}).click();await expect(page.getByRole("link",{name:new RegExp(`V1 management ${zone}`)})).toBeVisible();
 expect(stripeRequests).toEqual([]);
 expect(ok(await db.from("zone_charges").select("id").eq("edition_id",v1))).toHaveLength(0);
});
