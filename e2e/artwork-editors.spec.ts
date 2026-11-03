import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { editorImage } from "../tests/fixtures/editor-images";
import { deleteLocalCampaignFixtures } from "../tests/integration/local-layout-fixture";
import { renderPostcard } from "../src/lib/print/export";
import { POSTCARD_LAYOUT_V2 } from "../src/lib/print/layouts";
import type { Database } from "../src/lib/supabase/database.types";
process.loadEnvFile(".env.local");
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
if(!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))throw Error("Local fixtures only");
const db=createClient<Database>(url,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});
const admin=createClient<Database>(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
const email=`editors-${randomUUID()}@example.com`,password=randomBytes(24).toString("hex");
const ok=<T>(r:{data:T;error:unknown})=>{expect(r.error).toBeNull();return r.data;};
let user:string,campaign:string;
let previousHouse:Database["public"]["Tables"]["house_artwork"]["Row"]|null;
const houseIds:string[]=[];
const widths=[320,375,390,768,1440];
const screenshot=async(page:Page,name:string)=>{await page.evaluate(()=>window.scrollTo(0,0));return page.screenshot({path:`test-results/artwork-editors/${name}.png`,fullPage:true,animations:"disabled"});};
const login=async(page:Page)=>{
 await page.goto("/admin/login");await page.getByLabel("Email").fill(email);await page.getByLabel("Password").fill(password);
 await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page).toHaveURL(/\/admin$/);
};
test.beforeAll(async()=>{
 const created=await db.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();user=created.data.user!.id;
 ok(await db.from("admins").insert({user_id:user}));expect((await admin.auth.signInWithPassword({email,password})).error).toBeNull();
 const zone=ok(await db.from("zones").select("id").eq("slug","northern-westchester").single())!;
 campaign=ok(await admin.rpc("admin_create_square_campaign",{p:{zone_id:zone.id,name:"Editor local fixture",issue_month:"2098-06-01",target_quantity:5000,
  reservation_deadline:"2098-05-15T23:59:00Z",artwork_due_at:"2098-05-20T23:59:00Z",mailing_window_start:"2098-06-11",mailing_window_end:"2098-06-15",
  layout_template:POSTCARD_LAYOUT_V2.key,unit_price_cents:100,double_price_cents:null}}))!;
 ok(await admin.rpc("admin_set_campaign_status",{p_id:campaign,p_action:"open"}));
 previousHouse=ok(await db.from("house_artwork").select("*").maybeSingle());
});
test.afterAll(async()=>{
 if(previousHouse)ok(await db.from("house_artwork").upsert(previousHouse));else ok(await db.from("house_artwork").delete().eq("updated_by",user));
 for(const id of houseIds){const u=ok(await db.from("artwork_uploads").select("*").eq("id",id).maybeSingle());if(!u)continue;
  ok(await db.storage.from("house-artwork").remove([u.storage_path]));if(u.original_path)ok(await db.storage.from("house-artwork-originals").remove([u.original_path]));ok(await db.from("artwork_uploads").delete().eq("id",id));}
 const bookings=ok(await db.from("bookings").select("id,cart_id").eq("edition_id",campaign))!;
 ok(await db.from("bookings").delete().eq("edition_id",campaign));
 deleteLocalCampaignFixtures([campaign]);
 if(bookings.length){const ids=bookings.map(b=>b.id),uploads=ok(await db.from("artwork_uploads").select("storage_path").in("booking_id",ids))!;
  if(uploads.length)ok(await db.storage.from("artwork").remove(uploads.map(u=>u.storage_path)));ok(await db.from("artwork_uploads").delete().in("booking_id",ids));
  const carts=bookings.flatMap(b=>b.cart_id?[b.cart_id]:[]);if(carts.length)ok(await db.from("reservation_carts").delete().in("id",carts));}
 ok(await db.from("admin_events").delete().eq("admin_user_id",user));await admin.auth.signOut();expect((await db.auth.admin.deleteUser(user)).error).toBeNull();
});

test("house editor explains insufficient source, saves minimum and high-resolution images, verifies GET and export",async({page})=>{
 test.setTimeout(120000);await login(page);await page.goto("/admin/settings");
 const input=page.getByLabel("House artwork (PNG or JPEG, up to 3 MB)");
 await expect(input).toBeEnabled();
 await input.setInputFiles({name:"small.png",mimeType:"image/png",buffer:await editorImage(495,619)});
 await expect(page.getByRole("alert").filter({hasText:"This original is too small"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Save house artwork",exact:true})).toBeDisabled();
 await screenshot(page,"house-small-source");
 for(const [w,h] of [[1122,745],[2000,1400]]){
  const buffer=await editorImage(w,h);await expect(input).toBeEnabled();await input.setInputFiles({name:"house.png",mimeType:"image/png",buffer});
  const save=page.getByRole("button",{name:"Save house artwork",exact:true});
  await expect(page.getByText(/^Original:/)).toContainText(`${w} × ${h}`);
  await screenshot(page,`house-input-${w}`);
  await expect(save,await page.getByText(/^Original:/).innerText()).toBeEnabled();
  if(w===2000){
   // Exercise the real cropper's transient zero-size resize event, not only a mock.
   const cropEditor=page.getByLabel("House artwork crop editor",{exact:true});
   await cropEditor.evaluate(async element=>{
    element.style.width="0px";
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
   });
   await expect(save).toBeEnabled();
   await cropEditor.evaluate(element=>{element.style.removeProperty("width");});
   for(const width of widths){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);await screenshot(page,`house-editor-${width}`);}
   await page.getByRole("slider",{name:"House artwork zoom"}).fill("1.2");await page.getByRole("button",{name:"Reset",exact:true}).click();
   await expect(page.getByRole("slider",{name:"House artwork zoom"})).toHaveValue("1");
  }
  await save.click();await expect(page.getByRole("status")).toContainText("House artwork saved and verified");
  const active=ok(await db.from("house_artwork").select("*").single())!;
  const row=ok(await db.from("artwork_uploads").select("id,original_path").eq("storage_path",active.storage_path).single())!;houseIds.push(row.id);
  const original=ok(await db.storage.from("house-artwork-originals").download(row.original_path!))!;
  expect(Buffer.from(await original.arrayBuffer()).equals(buffer)).toBe(true);
  const get=await page.request.get(`/admin/house-artwork?verify=${encodeURIComponent(active.updated_at)}`);
  expect(get.ok()).toBe(true);expect(await sharp(await get.body()).metadata()).toMatchObject({width:2990,height:1986});
  await page.reload();await expect(page.getByAltText("Current permanent house advertisement")).toHaveJSProperty("naturalWidth",2990);
 }
 await screenshot(page,"house-save-verified");
 const before=ok(await db.from("house_artwork").select("*").single())!;
 await page.route("**/admin/house-artwork",route=>route.request().method()==="POST"?route.fulfill({status:503,body:"Upload failed. Your saved artwork is unchanged."}):route.continue());
 await expect(input).toBeEnabled();
 await input.setInputFiles({name:"retry.png",mimeType:"image/png",buffer:await editorImage(1600,1200)});
 await page.getByRole("button",{name:"Save house artwork",exact:true}).click();await expect(page.getByRole("status")).toContainText("Upload failed");
 expect(ok(await db.from("house_artwork").select("*").single())).toEqual(before);
 await expect(page.getByRole("button",{name:"Save house artwork",exact:true})).toBeEnabled();
 const download=await page.request.post(`/admin/print/${campaign}`,{headers:{origin:"http://localhost:3000"},multipart:{side:"back"}});
 expect(download.ok()).toBe(true);const png=await download.body();expect(await sharp(png).metadata()).toMatchObject({width:7300,height:4900,density:800});
 const house=ok(await db.storage.from("house-artwork").download(before.storage_path))!;
 const expected=await renderPostcard("back",[],Buffer.from(await house.arrayBuffer()),[],POSTCARD_LAYOUT_V2);
 expect(createHash("sha256").update(await sharp(png).raw().toBuffer()).digest("hex")).toEqual(createHash("sha256").update(await sharp(expected).raw().toBuffer()).digest("hex"));
});

test("Fit/Fill, stable crop consent, safe replacement, all viewports and original bytes",async({page,browser})=>{
 test.setTimeout(150000);const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 const stripe:string[]=[];await page.context().route(/https:\/\/api\.stripe\.com\//,r=>{stripe.push(r.request().url());return r.abort();});
 await page.goto("/areas");await page.getByRole("checkbox",{name:/Northern Westchester/}).check();await page.getByRole("button",{name:"Continue with selected areas"}).click();
 await page.getByRole("button",{name:/position B1:/}).click();await page.getByRole("button",{name:"Continue to artwork"}).click();
 await expect(page).toHaveURL(/\/book\/artwork$/);
 const input=page.getByLabel("Ad image file").filter({visible:true}), save=page.getByRole("button",{name:"Save artwork and continue",exact:true});
 for(const [w,h,transparent] of [[300,300,false],[1800,1800,false],[1000,1600,false],[1600,900,false],[1200,1200,true]] as const){
  const buffer=await editorImage(w,h,transparent);await input.setInputFiles({name:"fixture.png",mimeType:"image/png",buffer});
  await expect(page.getByText(/Image uploaded/)).toBeVisible();await expect(page.getByRole("button",{name:"Fit entire image"})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByAltText("Full artwork fitted without stretching")).toHaveJSProperty("naturalWidth",w);
  await expect(save).toBeEnabled();await expect(page.getByRole("checkbox")).toHaveCount(0);
 }
 await expect(page.getByRole("complementary").getByText("$1",{exact:true})).toBeVisible(); // accepted immutable campaign price
 for(const width of widths){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);await screenshot(page,`customer-fit-${width}`);}
 // Compare the large browser Fit preview with the exact B1 panel extracted from Sharp.
 const preview=await page.getByAltText("Full artwork fitted without stretching").locator("..").locator("..").screenshot();
 const size=await sharp(preview).metadata();
 const frontSource=await editorImage(1200,1200,true);
 const rendered=await renderPostcard("back",[{label:"B1",input:frontSource,crop:{x:0,y:0,width:1200,height:1200}}],undefined,[],POSTCARD_LAYOUT_V2);
 const panel=POSTCARD_LAYOUT_V2.paidSlots.find(s=>s.label==="B1")!;
 const expected=await sharp(rendered).extract({left:Math.round(panel.x*800),top:Math.round(panel.y*800),width:Math.round(panel.width*800),height:Math.round(panel.height*800)}).resize(size.width!,size.height!,{fit:"fill"}).removeAlpha().raw().toBuffer();
 const actual=await sharp(preview).removeAlpha().raw().toBuffer();
 const difference=actual.reduce((sum,n,i)=>sum+Math.abs(n-expected[i]),0)/actual.length;
 expect(difference,"browser Fit vs Sharp mean channel error").toBeLessThan(5);
 await page.getByRole("button",{name:"Fill space"}).click();await expect(save).toBeDisabled();
 const slider=page.getByRole("slider",{name:"Zoom",exact:true});await slider.fill("1.3");
 const editor=page.getByLabel("Your ad. Drag to move it, or use the arrow keys.");
 await editor.focus();await page.keyboard.press("ArrowRight");
 await page.getByRole("checkbox",{name:/I approve this crop/}).check();await expect(save).toBeEnabled();
 await page.getByRole("button",{name:"Fit entire image"}).click();await page.getByRole("button",{name:"Fill space"}).click();
 await expect(page.getByRole("checkbox")).toBeChecked();await expect(slider).toHaveValue("1.3");
 await slider.fill("1.5");await expect(page.getByRole("checkbox")).not.toBeChecked();
 await page.getByRole("button",{name:"Reset",exact:true}).click();await expect(slider).toHaveValue("1");
 for(const width of widths){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);await screenshot(page,`customer-fill-${width}`);}
 await page.getByRole("checkbox").check();await save.click();await expect(page).toHaveURL(/\/book\/cart$/);
 const booking=ok(await db.from("bookings").select("id,price_cents,stripe_customer_id,stripe_setup_intent_id").eq("edition_id",campaign).single())!;
 expect(booking).toMatchObject({price_cents:100,stripe_customer_id:null,stripe_setup_intent_id:null});
 const active=ok(await db.from("booking_artwork").select("*").eq("booking_id",booking.id).single())!;
 const original=await editorImage(1200,1200,true);
 expect(Buffer.from(await ok(await db.storage.from("artwork").download(active.storage_path))!.arrayBuffer()).equals(original)).toBe(true);
 await page.getByRole("button",{name:/(?:Add|Edit) artwork for Northern Westchester$/}).click();
 await expect(page.getByRole("button",{name:"Fill space"})).toHaveAttribute("aria-pressed","true");
 await page.route("**/storage/v1/object/upload/sign/**",async r=>{await new Promise(resolve=>setTimeout(resolve,300));await r.abort();});
 await input.setInputFiles({name:"interrupted.png",mimeType:"image/png",buffer:await editorImage(1400,1000)});
 await expect(page.getByRole("alert").filter({hasText:"interrupted"})).toBeVisible();
 expect(ok(await db.from("booking_artwork").select("*").eq("booking_id",booking.id).single())).toEqual(active);
 await expect(editor).toBeVisible();await page.unroute("**/storage/v1/object/upload/sign/**");
 // Touch editor is exercised in its own mobile context using the same authorized local hold.
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await page.context().storageState()});
 const touch=await mobile.newPage();await touch.goto("/book/artwork");
 await touch.getByRole("button",{name:"Fit entire image"}).tap();await touch.getByRole("button",{name:"Fill space"}).tap();
 await expect(touch.getByRole("slider")).toBeVisible();expect(await touch.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 const touchEditor=touch.getByLabel("Your ad. Drag to move it, or use the arrow keys.");await touchEditor.scrollIntoViewIfNeeded();
 const rect=await touchEditor.boundingBox();const x=rect!.x+rect!.width/2,y=rect!.y+rect!.height/2;
 const cdp=await mobile.newCDPSession(touch);
 const zoomBefore=Number(await touch.getByRole("slider").inputValue());
 const points=(d:number)=>[{x:x-d,y,id:0},{x:x+d,y,id:1}];
 await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:points(35)});
 await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:points(50)});
 await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:points(70)});
 await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
 await expect.poll(async()=>Number(await touch.getByRole("slider").inputValue())).toBeGreaterThan(zoomBefore);
 await cdp.detach();
 await screenshot(touch,"customer-touch");await mobile.close();
 expect(errors).toEqual([]);expect(stripe).toEqual([]);
});
