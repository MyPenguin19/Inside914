import { cookies } from "next/headers";
import { z } from "zod";
import { ACCESS_COOKIE,resolveAccessToken } from "@/lib/access/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const headers={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"};
 const {id}=await params;
 if(!z.uuid().safeParse(id).success)return new Response("Not found",{status:404,headers});
 const db=createAdminClient(),booking=await resolveAccessToken(db,(await cookies()).get(ACCESS_COOKIE)?.value);
 if(!booking)return new Response("Not found",{status:404,headers});
 const documents=await db.rpc("customer_mailing_evidence",{p_booking:booking});
 const document=documents.data?.find(d=>d.id===id);
 if(documents.error||!document)return new Response("Not found",{status:404,headers});
 const signed=await db.storage.from("mailing-evidence").createSignedUrl(document.storage_path,60,{download:true});
 if(signed.error)return new Response("Document temporarily unavailable",{status:503,headers});
 return new Response(null,{status:303,headers:{...headers,Location:signed.data.signedUrl}});
}
