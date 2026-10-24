import "server-only";
import { beginOperation } from "./charge";
import { bookingAllowsCollection } from "./booking-authorization";
import { createHoldToken, hashHoldToken } from "@/lib/booking/hold-token";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
export const PAYMENT_COOKIE="inside914_payment_recovery";
export async function issueRecovery(db:SupabaseClient<Database>, id:string) {
  await beginOperation(db,id,"recovery");
  const {token,hash}=createHoldToken();
  const {data,error}=await db.from("zone_charges").update({recovery_hash:hash}).eq("id",id).in("status",["requires_action","requires_payment_method"]).gt("recovery_expires_at",new Date().toISOString()).select("id").maybeSingle();
  if(error || !data) throw new Error("Recovery is unavailable or overdue; administrator review is required");
  return token;
}
export async function resolveRecovery(db:SupabaseClient<Database>,token:string|undefined) {
  if(!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const {data,error}=await db.from("zone_charges").select("*").eq("recovery_hash",hashHoldToken(token)).gt("recovery_expires_at",new Date().toISOString()).in("status",["requires_action","requires_payment_method","processing"]).maybeSingle();
  if(error) throw new Error("Recovery lookup unavailable");
  if(data) {const consent=await db.rpc("assert_charge_consent",{p_charge:data.id});if(consent.error)return null;}
  if (data && !await bookingAllowsCollection(db, data.booking_id)) return null;
  if(data) { try { await beginOperation(db,data.id,"recovery"); } catch { return null; } }
  return data;
}
