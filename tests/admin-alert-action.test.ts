// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),refresh:vi.fn()}));
vi.mock("@/lib/admin/auth",()=>({requireAdmin:async()=>({supabase:{rpc:mocks.rpc}})}));
vi.mock("next/cache",()=>({revalidatePath:mocks.refresh}));
import { acknowledgeAlert } from "@/app/admin/operations-actions";
beforeEach(()=>vi.resetAllMocks());
test("failed alert acknowledgement reaches the retry boundary instead of silently refreshing",async()=>{
 mocks.rpc.mockResolvedValue({error:{message:"database unavailable"}});
 const form=new FormData();form.set("id","00000000-0000-4000-8000-000000000001");
 await expect(acknowledgeAlert(form)).rejects.toThrow("Could not acknowledge");
 expect(mocks.refresh).not.toHaveBeenCalled();
});
