import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAYMENT_COOKIE,resolveRecovery } from "@/lib/payments/recovery";
import { getCollectionContext } from "@/lib/payments/environment";
import { verifyLedgerContext } from "@/lib/payments/charge";
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}) {
  const {token}=await params;let valid=false;
  try {const context=getCollectionContext();const charge=await resolveRecovery(createAdminClient(),token);if(charge){verifyLedgerContext(charge,context);valid=true;}} catch {valid=false;}
  const response=NextResponse.redirect(new URL(valid ? "/pay" : "/pay?invalid=1",request.url),303);
  response.headers.set("Referrer-Policy","no-referrer");response.headers.set("Cache-Control","no-store");
  if(valid) response.cookies.set(PAYMENT_COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/pay",maxAge:3*86400});
  return response;
}
