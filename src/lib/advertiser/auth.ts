import "server-only";
import { connection } from "next/server";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
const advertiserAccountsEnabled = () => false;
export async function requireAdvertiser() {
  // Advertiser accounts are disconnected from the MVP, including direct action calls.
  if (!advertiserAccountsEnabled()) redirect("/areas");
  await connection();
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user || !user.email_confirmed_at || user.is_anonymous)
    redirect("/account/login");
  const proof = await client
    .from("advertiser_email_verifications")
    .select("verified_email")
    .eq("user_id", user.id)
    .maybeSingle();
  if (proof.error || proof.data?.verified_email !== user.email?.toLowerCase())
    redirect("/account/verify");
  return { client, user };
}
export async function requireReservation(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  const session = await requireAdvertiser();
  const claim = await session.client.rpc("claim_advertiser_bookings");
  if (claim.error) throw new Error("Could not load your reservations.");
  const { data, error } = await session.client
    .from("advertiser_bookings")
    .select("booking_id")
    .eq("booking_id", id)
    .maybeSingle();
  if (error || !data) notFound();
  return { ...session, admin: createAdminClient() };
}
export function canEditReservation(
  booking: { status: string },
  edition: {
    status: string;
    artwork_due_at: string | null;
    artwork_deadline: string;
  },
  now = Date.now(),
) {
  return (
    booking.status === "reserved" &&
    ["open", "closed"].includes(edition.status) &&
    now < Date.parse(edition.artwork_due_at ?? edition.artwork_deadline)
  );
}
