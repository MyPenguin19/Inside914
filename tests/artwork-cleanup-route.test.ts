// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
const mocks=vi.hoisted(()=>({admin:vi.fn(),cleanup:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:mocks.admin}));
vi.mock("@/lib/artwork/cleanup",()=>({cleanupAbandonedArtwork:mocks.cleanup}));
import { GET } from "@/app/api/internal/artwork-cleanup/route";
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
test.each([undefined,"","Bearer wrong"])("cleanup refuses missing/invalid authorization: %s",async header=>{
 vi.stubEnv("CRON_SECRET","local-cron-fixture");
 const response=await GET(new Request("http://localhost/api/internal/artwork-cleanup",{headers:header?{authorization:header}:{}}));
 expect(response.status).toBe(401);expect(mocks.admin).not.toHaveBeenCalled();expect(mocks.cleanup).not.toHaveBeenCalled();
});
test("cleanup is disabled without CRON_SECRET",async()=>{
 vi.stubEnv("CRON_SECRET","");expect((await GET(new Request("http://localhost/api/internal/artwork-cleanup",{headers:{authorization:"Bearer "}}))).status).toBe(401);
 expect(mocks.admin).not.toHaveBeenCalled();
});
test("authorized job reports cleanup results",async()=>{
 vi.stubEnv("CRON_SECRET","local-cron-fixture");mocks.admin.mockReturnValue({fixture:true});mocks.cleanup.mockResolvedValue({claimed:2,removed:1});
 const response=await GET(new Request("http://localhost/api/internal/artwork-cleanup",{headers:{authorization:"Bearer local-cron-fixture"}}));
 expect(await response.json()).toEqual({claimed:2,removed:1});expect(mocks.cleanup).toHaveBeenCalledWith({fixture:true});
});
