// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
const mocks=vi.hoisted(()=>({auth:vi.fn(),house:vi.fn(),rpc:vi.fn(),stripe:vi.fn(),verify:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/admin/auth",()=>({requireAdmin:mocks.auth}));
vi.mock("@/lib/print/house-artwork",()=>({loadHouseArtwork:mocks.house}));
vi.mock("next/cache",()=>({refresh:vi.fn()}));
vi.mock("@/lib/payments/charge",()=>({getCollectionStripe:mocks.stripe,verifyStripeAccount:mocks.verify,collectCharge:vi.fn(),verifyLedgerContext:vi.fn()}));
import { publishEvidence } from "@/app/admin/admin-actions";
import { activateZone, markCampaignMailed } from "@/app/admin/collection-actions";
const id="00000000-0000-4000-8000-000000000001";
beforeEach(()=>{
 vi.resetAllMocks();
 mocks.auth.mockResolvedValue({supabase:{rpc:mocks.rpc,from:()=>({select:()=>({eq:()=>({single:async()=>({data:{kind:"final_proof",edition_id:id,editions:{product_model:"square_v1"}}})})})})}});
});
test("invalid house blocks final proof approval without publishing",async()=>{
 const form=new FormData();form.set("evidence_id",id);form.set("publish","true");
 expect((await publishEvidence({},form)).message).toContain("house artwork needs attention");
 expect(mocks.rpc).not.toHaveBeenCalled();
});
test("invalid house blocks final mailing and collection before Stripe or database writes",async()=>{
 const form=new FormData();form.set("id",id);
 expect((await markCampaignMailed({},form)).message).toContain("house artwork needs attention");
 expect((await activateZone({},form)).message).toContain("house artwork needs attention");
 expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.verify).not.toHaveBeenCalled();
});
test("valid house retains existing database proof and readiness gates",async()=>{
 mocks.house.mockResolvedValue(Buffer.from("validated"));
 mocks.rpc.mockResolvedValue({error:{message:"not ready"}});
 const form=new FormData();form.set("id",id);
 expect((await markCampaignMailed({},form)).message).toContain("not ready to mail");
 expect(mocks.rpc).toHaveBeenCalledWith("admin_mark_square_mailed",{p_id:id});
});
