import { deleteLocalCampaignFixtures } from "../tests/integration/local-layout-fixture";
import sharp from "sharp";
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
let previousHouse: Record<string,unknown>|null = null;
const housePaths: string[] = [];
function ok<T>(r: { data: T; error: unknown }) { expect(r.error).toBeNull(); return r.data; }

test.beforeAll(async () => {
  previousHouse=ok(await db.from("house_artwork").select("*").eq("singleton",true).maybeSingle());
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  user = created.data.user!.id;
  ok(await db.from("admins").insert({ user_id: user }));
  ok(await db.from("zones").insert({ id: zone, name: `Square fixture ${zone}`, slug: `square-e2e-${zone}`, household_count: 5000 }));
});
test.afterAll(async () => {
  if(previousHouse) ok(await db.from("house_artwork").upsert(previousHouse));
  else ok(await db.from("house_artwork").delete().eq("updated_by",user));
  if(housePaths.length) ok(await db.storage.from("house-artwork").remove(housePaths));
  deleteLocalCampaignFixtures(ok(await db.from("editions").select("id").eq("zone_id",zone))!.map(e=>e.id));
  ok(await db.from("zones").delete().eq("id", zone));
  if (user) {
    ok(await db.from("admin_events").delete().eq("admin_user_id", user));
    expect((await db.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("admin creates a $399 ten-square draft; form and inventory fit mobile through desktop", async ({ page }) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", {name:"Manage Inside914"})).toBeVisible();
  await page.goto("/admin/settings");
  const image = await sharp({create:{width:2000,height:1600,channels:3,background:"blue"}}).png().toBuffer();
  await expect(page.getByLabel("House artwork (PNG or JPEG, up to 3 MB)")).toBeEnabled();
  await page.getByLabel("House artwork (PNG or JPEG, up to 3 MB)").setInputFiles({name:"house.png",mimeType:"image/png",buffer:image});
  await page.getByText("Final panel preview",{exact:true}).click();
  await expect(page.getByAltText("Final house crop preview")).toBeVisible();
  await page.getByRole("slider",{name:"House artwork zoom"}).focus();
  await page.getByRole("slider",{name:"House artwork zoom"}).press("ArrowRight");
  await expect(page.getByRole("slider",{name:"House artwork zoom"})).toHaveValue("1.01");
  await expect(page.getByRole("button",{name:"Save house artwork"})).toBeEnabled();
  await page.screenshot({path:"../../outputs/inside914-background-comparison/house-crop-editor.png",fullPage:true});
  expect(errors, "House editor must remain healthy after full-page capture").toEqual([]);
  await page.getByRole("button",{name:"Save house artwork"}).click();
  await expect(page.getByRole("status")).toContainText("House artwork saved");
  const savedHouse=ok(await db.from("house_artwork").select("storage_path,width_px,height_px").single())!;
  expect([savedHouse.width_px,savedHouse.height_px]).toEqual([2990,1986]);
  housePaths.push(savedHouse.storage_path);
  await expect(page.getByAltText("Current permanent house advertisement")).toBeVisible();
  await page.goto(`/admin/campaigns/new?area=square-e2e-${zone}`);
  const price = page.getByLabel("Price per advertising position ($)", { exact: false });
  await expect(price).toHaveValue("399");
  await expect(price).toBeEditable();
  await expect(page.getByLabel("Double price", { exact: false })).toHaveCount(0);
  await expect(page.getByLabel("Postcard layout").locator("option")).toHaveCount(1);
  await page.getByLabel("Campaign name").fill("Square E2E draft");
  await page.getByLabel("Mailing month").fill("2098-01");
  await page.getByLabel("Target mailing quantity", { exact: false }).fill("5000");
  await page.getByLabel("Reservation deadline").fill("2097-12-15T23:59");
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
  await expect(page.getByText("$399 per position · 10 paid positions", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Front of the postcard" }).locator("button")).toHaveCount(6);
  await expect(page.getByRole("group", { name: "Back of the postcard" }).locator("button")).toHaveCount(4);
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `inventory at ${width}`).toBeLessThanOrEqual(width);
  }
  const campaign = ok(await db.from("editions").select("id,status,product_model,layout_template,unit_price_cents,double_unit_price_cents").eq("zone_id", zone).single());
  expect(campaign).toMatchObject({ status: "draft", product_model: "square_v1", layout_template:"amazingmail-9x6-v2", unit_price_cents: 39900, double_unit_price_cents: null });
  expect(ok(await db.from("slots").select("id").eq("edition_id", campaign!.id))).toHaveLength(10);
  await expect(page.getByRole("link", {name:"Review payments"})).toBeVisible();
  await expect(page.getByText("0 of 10 spots filled", {exact:true})).toBeVisible();
  await expect(page.getByText("Layout approved. Open this campaign when you're ready to accept reservations.")).toBeVisible();
  await expect(page.getByText("Campaign not open yet", {exact:true})).toBeVisible();
  await page.getByRole("button", {name:"Open for reservations", exact:true}).click();
  expect(ok(await db.from("editions").select("status").eq("id",campaign!.id).single())!.status).toBe("draft");
  await page.getByRole("button", {name:"Open now", exact:true}).click();
  await expect(page.getByRole("button", {name:"Pause new reservations", exact:true})).toBeVisible();
  expect(ok(await db.from("editions").select("status").eq("id",campaign!.id).single())!.status).toBe("open");
  expect(ok(await db.from("slot_availability").select("slot_id").eq("edition_id",campaign!.id).eq("available",true))).toHaveLength(10);
  await page.goto(`/admin/production?campaign=${campaign!.id}`);
  await expect(page).toHaveURL(new RegExp(`/admin/campaigns/${campaign!.id}$`));
  await expect(page.getByText("PREVIEW — NOT READY TO MAIL", {exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Charge Advertisers & Prepare Mailing",exact:true})).toBeDisabled();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", {name:"Download front",exact:true}).click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toContain("-PREVIEW.png");
  const path=await download.path();
  expect(await sharp(path!).metadata()).toMatchObject({width:7300,height:4900,density:800});
  const back=await page.request.post(`/admin/print/${campaign!.id}`,{headers:{origin:"http://localhost:3000"},multipart:{side:"back"}});
  expect(back.status()).toBe(200);
  expect(back.headers()["x-postcard-readiness"]).toBe("preview");
  const pixel=[...await sharp(await back.body()).extract({left:5000,top:1000,width:1,height:1}).removeAlpha().raw().toBuffer()];
  expect(pixel).toEqual([0,0,255]);
  const before=ok(await db.from("editions").select("status").eq("id",campaign!.id).single());
  expect(before!.status).toBe("open");
  expect(ok(await db.from("zone_charges").select("id").eq("edition_id",campaign!.id))).toHaveLength(0);
  for (const width of [320,375,390,768,1440]) {
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth), `campaign operations at ${width}`).toBeLessThanOrEqual(width);
  }
  await page.getByRole("button",{name:"Preview postcard",exact:true}).click();
  await expect(page.getByAltText("Back current postcard")).toBeVisible({timeout:20000});
  await page.screenshot({path:"../../outputs/inside914-campaign-operations.png",fullPage:true});
  // Legacy, missing and unreadable global artwork must never disable current-state exports.
  const normalizedHouse=ok(await db.from("house_artwork").select("*").single())!;
  for (const kind of ["missing","legacy","unreadable"]) {
    if (kind === "missing") ok(await db.from("house_artwork").delete().eq("singleton",true));
    else {
      const path=`house/${randomUUID()}.png`;housePaths.push(path);
      ok(await db.storage.from("house-artwork").upload(path,kind === "legacy" ? image : Buffer.from("corrupt"),{contentType:"image/png"}));
      ok(await db.from("house_artwork").upsert({...normalizedHouse,storage_path:path,width_px:2000,height_px:1600}));
    }
    await page.reload();
    await expect(page.getByRole("alert").filter({hasText:"Permanent house artwork needs attention"})).toBeVisible();
    await page.getByRole("button",{name:"Preview postcard",exact:true}).click();
    await expect(page.getByAltText("Front current postcard")).toBeVisible({timeout:20000});
    await expect(page.getByAltText("Back current postcard")).toBeVisible({timeout:20000});
    if(kind === "legacy") await page.screenshot({path:"../../outputs/inside914-house-fallback.png",fullPage:true});
    for(const side of ["front","back"]) {
      const response=await page.request.post(`/admin/print/${campaign!.id}`,{headers:{origin:"http://localhost:3000"},multipart:{side}});
      expect(response.status()).toBe(200);
      expect(response.headers()["x-postcard-readiness"]).toBe("preview");
      if(side === "back") expect([...await sharp(await response.body()).extract({left:5000,top:1000,width:1,height:1}).removeAlpha().raw().toBuffer()]).toEqual([244,242,236]);
    }
    await expect(page.getByRole("button",{name:"Charge Advertisers & Prepare Mailing",exact:true})).toBeDisabled();
  }
  ok(await db.from("house_artwork").upsert(normalizedHouse));
  await page.goto("/admin/settings");
  const replacement=await sharp({create:{width:2000,height:1600,channels:3,background:"green"}}).png().toBuffer();
  await expect(page.getByLabel("House artwork (PNG or JPEG, up to 3 MB)")).toBeEnabled();
  await page.getByLabel("House artwork (PNG or JPEG, up to 3 MB)").setInputFiles({name:"replacement.png",mimeType:"image/png",buffer:replacement});
  await page.getByRole("button",{name:"Save house artwork",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("House artwork saved");
  housePaths.push(ok(await db.from("house_artwork").select("storage_path").single())!.storage_path);
  const next=await page.request.post(`/admin/print/${campaign!.id}`,{headers:{origin:"http://localhost:3000"},multipart:{side:"back"}});
  expect(next.status()).toBe(200);
  expect([...await sharp(await next.body()).extract({left:5000,top:1000,width:1,height:1}).removeAlpha().raw().toBuffer()]).toEqual([0,128,0]);
  await page.goto("/pay/"+"x".repeat(43));
  await expect(page).toHaveURL(/\/pay\?invalid=1$/);
  await expect(page.getByRole("heading",{name:"Payment link unavailable"})).toBeVisible();
  expect(errors).toEqual([]);
});
