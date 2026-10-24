import { beforeEach, expect, test, vi } from "vitest";
vi.mock("server-only",()=>({}));
const auth=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/admin/auth",()=>({requireAdmin:auth}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import { recordPrinterStage } from "@/app/admin/operations-actions";
let rpc:ReturnType<typeof vi.fn>,download:ReturnType<typeof vi.fn>;
const id="00000000-0000-4000-8000-000000000001";
function form(){const f=new FormData();for(const [k,v]of Object.entries({editionId:id,evidenceId:id,stage:"submitted",notes:"Printer acknowledged receipt",confirmed:"on"}))f.set(k,v);return f;}
beforeEach(()=>{
 rpc=vi.fn(async()=>({data:id,error:null}));download=vi.fn(async()=>({data:new Blob(["fixture"]),error:null}));
 const chain={select:()=>chain,eq:()=>chain,single:async()=>({data:{storage_path:`${id}/proof.pdf`},error:null})};
 auth.mockResolvedValue({supabase:{from:()=>chain,storage:{from:()=>({download})},rpc}});
});
test("failed printer record upload never records a milestone",async()=>{
 download.mockResolvedValue({data:null,error:{message:"missing"}});
 expect((await recordPrinterStage({},form())).message).toContain("could not be verified");expect(rpc).not.toHaveBeenCalled();
});
test("printer evidence and explicit manual confirmation are required",async()=>{
 const f=form();f.delete("confirmed");expect((await recordPrinterStage({},f)).ok).not.toBe(true);expect(download).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
 expect((await recordPrinterStage({},form())).ok).toBe(true);expect(rpc).toHaveBeenCalledWith("admin_record_printer_stage",{p_edition:id,p_evidence:id,p_stage:"submitted",p_notes:"Printer acknowledged receipt"});
});
test("printer milestone action authenticates before accessing storage or data",async()=>{
 auth.mockRejectedValue(new Error("Sign in"));await expect(recordPrinterStage({},form())).rejects.toThrow("Sign in");expect(download).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
});
