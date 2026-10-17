import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Account-free reservation links: a 256-bit random token in the link, only its SHA-256 stored.
// Tokens are scoped to one booking, expire, and can be revoked or rotated.

type Admin = SupabaseClient<Database>;

export const ACCESS_COOKIE = "inside914_access";
export const ACCESS_TOKEN_DAYS = 180;

export const hashAccessToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function issueAccessToken(admin: Admin, bookingId: string, days = ACCESS_TOKEN_DAYS) {
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await admin
    .from("booking_access_tokens")
    .insert({
      booking_id: bookingId,
      token_hash: hashAccessToken(token),
      expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not issue access token: ${error.message}`);
  return { id: data.id, token };
}

export async function revokeAccessToken(admin: Admin, tokenId: string) {
  const { error } = await admin
    .from("booking_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .is("revoked_at", null);
  if (error) throw new Error(`Could not revoke access token: ${error.message}`);
}

// New link for a booking; every earlier link stops working.
export async function rotateAccessToken(admin: Admin, bookingId: string) {
  const { error } = await admin
    .from("booking_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("booking_id", bookingId)
    .is("revoked_at", null);
  if (error) throw new Error(`Could not rotate access tokens: ${error.message}`);
  return issueAccessToken(admin, bookingId);
}

// The booking a token opens, or null (unknown, revoked or expired all look the same).
export async function resolveAccessToken(admin: Admin, token: string | undefined): Promise<string | null> {
  if (!token || token.length < 40 || token.length > 64) return null;
  const { data, error } = await admin
    .from("booking_access_tokens")
    .select("booking_id, expires_at, revoked_at")
    .eq("token_hash", hashAccessToken(token))
    .maybeSingle();
  if (error) throw new Error(`Could not check access token: ${error.message}`);
  if (!data || data.revoked_at || Date.parse(data.expires_at) <= Date.now()) return null;
  return data.booking_id;
}
