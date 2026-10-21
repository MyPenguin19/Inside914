// @vitest-environment node
import {expect,test,vi} from "vitest";
import sharp from "sharp";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/lib/supabase/database.types";
const download=vi.hoisted(()=>vi.fn());
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({storage:{from:()=>({download})}})}));
import {loadHouseArtwork} from "@/lib/print/house-artwork";
const db=(data:unknown,error:unknown=null)=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data,error})})})})}) as unknown as SupabaseClient<Database>;
test.each(["missing","legacy","unreadable","storage-error","query-error","valid"])("%s house loading validates bytes and fails closed without throwing",async kind=>{
 const bytes=kind==="unreadable" ? Buffer.from("bad") : await sharp({create:{width:kind==="legacy"?2000:2990,height:2086,channels:3,background:"blue"}}).png().toBuffer();
 download.mockResolvedValue({data:new Blob([new Uint8Array(bytes)]),error:kind==="storage-error"?new Error("missing file"):null});
 const result=await loadHouseArtwork(db(kind==="missing"?null:{storage_path:"house/fixture.png"},kind==="query-error"?new Error("unavailable"):null));
 if(kind==="valid") expect(result?.equals(bytes)).toBe(true);else expect(result).toBeUndefined();
});
