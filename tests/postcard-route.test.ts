// @vitest-environment node
import {beforeEach,expect,test,vi} from "vitest";
const mocks=vi.hoisted(()=>({auth:vi.fn(),admin:vi.fn(),render:vi.fn(),house:vi.fn()}));
vi.mock("@/lib/admin/auth",()=>({requireAdmin:mocks.auth}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:mocks.admin}));
vi.mock("@/lib/print/export",()=>({renderPostcard:mocks.render}));
vi.mock("@/lib/print/house-artwork",()=>({loadHouseArtwork:mocks.house}));
import {POST} from "@/app/admin/print/[id]/route";
import {AMAZINGMAIL_9X6_LAYOUT as layout} from "@/lib/print/amazingmail-layout";
const id="00000000-0000-4000-8000-000000000001";
beforeEach(()=>{vi.resetAllMocks();mocks.house.mockResolvedValue(Buffer.from("house"));});
test.each([1,4,9,10])("authenticated downloads at %i/10 pass current unapproved artwork to the same renderer",async count=>{
 const rows=layout.paidSlots.slice(0,count).map(s=>({id:s.label,status:"reserved",booking_slots:[{released_at:null,slots:{label:s.label,side:s.side}}],booking_artwork:{status:"ready",review_status:"pending",storage_path:`${s.label}.png`,crop_x:0,crop_y:0,crop_width:900,crop_height:900}}));
 const download=vi.fn().mockResolvedValue({data:new Blob(["image"]),error:null});
 const storage=vi.fn(()=>({download}));
 const rpc=vi.fn().mockResolvedValue({data:false,error:null});
 const from=vi.fn((table:string)=>({select:()=>({eq:()=>({single:async()=>({data:{product_model:"square_v1",layout_template:layout.key}}),not:async()=>({data:rows,error:null}),maybeSingle:async()=>({data:table==="house_artwork" ? {storage_path:"house/current.png"} : null,error:null})})})}));
 mocks.auth.mockResolvedValue({supabase:{from,rpc}});
 mocks.admin.mockReturnValue({storage:{from:storage}});
 mocks.render.mockResolvedValue(Buffer.from("png"));
 for(const side of ["front","back"]) {
  const body=new FormData();body.set("side",side);
  const response=await POST(new Request("http://localhost/admin/print/"+id,{method:"POST",headers:{origin:"http://localhost"},body}),{params:Promise.resolve({id})});
  expect(response.status).toBe(200);
  expect(response.headers.get("x-postcard-readiness")).toBe("preview");
  expect(response.headers.get("content-disposition")).toContain("PREVIEW");
  const call=mocks.render.mock.calls.at(-1)!;
  expect(call[0]).toBe(side);
  expect(call[1].map((a:{label:string})=>a.label)).toEqual(layout.paidSlots.slice(0,count).filter(s=>s.side===side).map(s=>s.label));
  if(side==="back") expect(Buffer.isBuffer(call[2])).toBe(true);
 }
 expect(rpc.mock.calls.every(([name])=>name==="admin_mail_readiness")).toBe(true);
 expect(from.mock.calls.every(([name])=>["editions","bookings","house_artwork"].includes(name))).toBe(true);
 expect(mocks.house).toHaveBeenCalled();
});
test("authorization failure prevents privileged storage access or rendering",async()=>{
 mocks.auth.mockRejectedValue(new Error("not admin"));
 await expect(POST(new Request("http://localhost/admin/print/"+id,{method:"POST"}),{params:Promise.resolve({id})})).rejects.toThrow("not admin");
 expect(mocks.admin).not.toHaveBeenCalled();expect(mocks.render).not.toHaveBeenCalled();
});

test.each([undefined,Buffer.from("valid-house")])("readiness requires validated house bytes even when the database is ready",async house=>{
 mocks.house.mockResolvedValue(house);
 mocks.auth.mockResolvedValue({supabase:{from:()=>({select:()=>({eq:()=>({single:async()=>({data:{product_model:"square_v1",layout_template:layout.key}}),not:async()=>({data:[],error:null})})})}),rpc:async()=>({data:true,error:null})}});
 mocks.render.mockResolvedValue(Buffer.from("png"));
 for(const side of ["front","back"]) {
  const body=new FormData();body.set("side",side);
  const response=await POST(new Request("http://localhost/admin/print/"+id,{method:"POST",headers:{origin:"http://localhost"},body}),{params:Promise.resolve({id})});
  expect(response.status).toBe(200);
  expect(response.headers.get("x-postcard-readiness")).toBe(house ? "ready" : "preview");
  expect(response.headers.get("content-disposition")?.includes("PREVIEW")).toBe(!house);
 }
});
