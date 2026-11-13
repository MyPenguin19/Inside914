// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),booked:vi.fn(),redirect:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/admin/auth",()=>({requireAdmin:async()=>({supabase:{rpc:mocks.rpc}})}));
vi.mock("@/lib/admin/data",()=>({hasBookings:mocks.booked}));
vi.mock("next/cache",()=>({refresh:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:mocks.redirect}));
import { updateCampaign } from "@/app/admin/admin-actions";
import { FIRST_CAMPAIGN_DEFAULTS } from "@/lib/admin/first-campaign";
const id="00000000-0000-4000-8000-000000000001",zone="00000000-0000-4000-8000-000000000002";
function form(){const data=new FormData();for(const [key,value] of Object.entries({...FIRST_CAMPAIGN_DEFAULTS,id,zone_id:zone}))data.set(key,value);return data;}
beforeEach(()=>{vi.resetAllMocks();mocks.booked.mockResolvedValue(false);mocks.rpc.mockResolvedValue({error:null});});
test("saving an unused draft sends the selected area to the database",async()=>{
 await updateCampaign({},form());
 expect(mocks.rpc).toHaveBeenCalledWith("admin_update_campaign",expect.objectContaining({p_id:id,p:expect.objectContaining({zone_id:zone})}));
 expect(mocks.redirect).toHaveBeenCalledWith(`/admin/campaigns/${id}`);
});
test("a reservation arriving during editing cannot silently discard the requested area",async()=>{
 mocks.booked.mockResolvedValue(true);mocks.rpc.mockResolvedValue({error:{message:"campaign_area_locked"}});
 const result=await updateCampaign({},form());
 expect(mocks.rpc).toHaveBeenCalledWith("admin_update_campaign",{p_id:id,p:{name:FIRST_CAMPAIGN_DEFAULTS.name,zone_id:zone,target_quantity:5000,unit_price_cents:39900}});
 expect(result.message).toContain("unused draft");expect(result.values?.zone_id).toBe(zone);expect(mocks.redirect).not.toHaveBeenCalled();
});
test("database errors retain the selected area and entered values for correction",async()=>{
 mocks.rpc.mockResolvedValue({error:{message:"campaign_exists_for_month"}});
 const result=await updateCampaign({},form());
 expect(result.message).toContain("already has a campaign");expect(result.values?.zone_id).toBe(zone);
 expect(mocks.redirect).not.toHaveBeenCalled();
});
test("failed reservation verification blocks the save",async()=>{
 mocks.booked.mockRejectedValue(new Error("offline"));
 expect((await updateCampaign({},form())).message).toContain("Nothing was changed");expect(mocks.rpc).not.toHaveBeenCalled();
});
