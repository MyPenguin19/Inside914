import { deleteLocalCampaignFixtures } from "./local-layout-fixture";
import { afterAll, beforeAll, expect, test, vi, describe } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { getBookableEditions } from "@/lib/catalog/queries";
import { SQUARE_TEMPLATE, V2_TEMPLATE } from "@/lib/admin/layouts";

describe.each([SQUARE_TEMPLATE, V2_TEMPLATE])("reservation layout $key", (template) => {
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {auth:{persistSession:false}});
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {auth:{persistSession:false}});
const zone = randomUUID();
let user: string;
let campaign: string;
function ok<T>(result: {data:T;error:unknown}): T { expect(result.error).toBeNull(); return result.data; }
beforeAll(async () => {
  const email = `layout-${randomUUID()}@example.com`, password = randomBytes(24).toString("hex");
  const created = await db.auth.admin.createUser({email,password,email_confirm:true});
  expect(created.error).toBeNull(); user = created.data.user!.id;
  ok(await db.from("admins").insert({user_id:user}));
  ok(await db.from("zones").insert({id:zone,name:`Layout ${zone}`,slug:`layout-${zone}`,household_count:5000}));
  expect((await admin.auth.signInWithPassword({email,password})).error).toBeNull();
  campaign = ok(await admin.rpc("admin_create_square_campaign", {p:{
    zone_id:zone,name:"Layout approval fixture",issue_month:"2098-01-01",target_quantity:5000,
    reservation_deadline:"2097-12-16T04:59:00Z",artwork_due_at:"2097-12-21T04:59:00Z",
    mailing_window_start:"2098-01-11",mailing_window_end:"2098-01-15",layout_template:template.key,
    unit_price_cents:39900,double_price_cents:null,
  }}));
});
afterAll(async () => {
  if (campaign) deleteLocalCampaignFixtures([campaign]);
  ok(await db.from("zones").delete().eq("id",zone));
  if (user) { ok(await db.from("admin_events").delete().eq("admin_user_id",user)); await admin.auth.signOut(); expect((await db.auth.admin.deleteUser(user)).error).toBeNull(); }
});
test("draft remains private; registry independently rejects an unregistered layout", async () => {
  expect(ok(await db.from("editions").select("status").eq("id",campaign).single())!.status).toBe("draft");
  const slots=ok(await db.from("slots").select("side,label,x_in,y_in,width_in,height_in").eq("edition_id",campaign))!;
  expect(slots).toHaveLength(10);
  for(const slot of template.slots) {
    expect(slots.find(s=>s.label===slot.label)).toEqual({side:slot.side,label:slot.label,x_in:slot.x,y_in:slot.y,width_in:slot.width,height_in:slot.height});
  }
  expect((await getBookableEditions()).some(e=>e.id===campaign)).toBe(false);
  // Removal is transaction-only and rolled back even if the assertion throws.
  execFileSync("python3", ["scripts/local-test-db.py","-c",`begin;
    delete from private.approved_layout_templates where template_key='${template.key}';
    do $$ begin
      begin update editions set status='open' where id='${campaign}';
      exception when sqlstate 'ADM04' then
        if sqlerrm='layout_not_approved' then return; end if; raise;
      end;
      raise exception 'Unregistered layout opened';
    end $$;
    rollback;`], {stdio:"pipe"});
});
test("explicit admin opening publishes exactly ten; pausing and closing remove availability", async () => {
  ok(await admin.rpc("admin_set_campaign_status",{p_id:campaign,p_action:"open"}));
  const opened=(await getBookableEditions()).find(e=>e.id===campaign);
  expect(opened).toMatchObject({bookable:true,totalUnits:10,availableUnits:10,unitPriceCents:39900});
  for (const action of ["pause","resume","close"]) {
    ok(await admin.rpc("admin_set_campaign_status",{p_id:campaign,p_action:action}));
    const edition=(await getBookableEditions()).find(e=>e.id===campaign);
    if(action==="resume") expect(edition).toMatchObject({bookable:true,availableUnits:10});
    else { expect(edition?.bookable ?? false).toBe(false); expect(edition?.availableUnits ?? 0).toBe(0); }
  }
});
test("approval does not bypass deadline, pricing, inventory, or scheduled opening rules", async () => {
  ok(await db.from("editions").update({artwork_deadline:"2000-01-01",artwork_due_at:"2000-01-02"}).eq("id",campaign));
  expect((await admin.rpc("admin_set_campaign_status",{p_id:campaign,p_action:"open"})).error?.message).toBe("deadline_passed");
  expect((await db.from("editions").update({unit_price_cents:0}).eq("id",campaign)).error).not.toBeNull();
  expect((await db.from("slots").delete().eq("edition_id",campaign)).error?.message).toBe("square_inventory_is_fixed");
  ok(await db.from("editions").update({artwork_deadline:"2097-12-16",artwork_due_at:"2097-12-21",reservations_open_at:"2097-12-01"}).eq("id",campaign));
  ok(await admin.rpc("admin_set_campaign_status",{p_id:campaign,p_action:"open"}));
  expect((await getBookableEditions()).find(e=>e.id===campaign)).toMatchObject({bookable:false,availableUnits:0});
  ok(await admin.rpc("admin_set_campaign_status",{p_id:campaign,p_action:"close"}));
});

});
