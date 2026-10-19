"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireReservation } from "@/lib/advertiser/auth";
import {
  beginDraft,
  finalizeDraft,
  RevisionLayout,
} from "@/lib/advertiser/artwork";
import { parseContact } from "@/lib/checkout/contact";
import { removeSavedCard } from "@/lib/checkout/card-removal";
import { getStripe } from "@/lib/checkout/stripe";
import { processOutboxForBooking } from "@/lib/email/outbox";
export type ManageState = { message?: string; done?: boolean };
export async function saveDetails(
  id: string,
  _state: ManageState,
  form: FormData,
): Promise<ManageState> {
  const { client, admin } = await requireReservation(id);
  const { data: old } = await admin
    .from("booking_contacts")
    .select("email")
    .eq("booking_id", id)
    .single();
  const parsed = parseContact({
    ...Object.fromEntries(form),
    email: old?.email,
  });
  if (!parsed.ok)
    return {
      message: "Check the business name, contact name, phone and website.",
    };
  const c = parsed.contact;
  const { error } = await client.rpc("advertiser_manage", {
    p_booking: id,
    p_action: "contact",
    p: {
      business_name: c.businessName,
      contact_name: c.contactName,
      phone: c.phone,
      website: c.website,
      category: c.category,
    },
  });
  if (error)
    return {
      message:
        "Changes are closed or could not be saved. Contact support if you need help.",
    };
  revalidatePath(`/dashboard/${id}`);
  return { done: true, message: "Details saved." };
}
export async function cancelReservation(
  id: string,
  _state: ManageState,
  form: FormData,
): Promise<ManageState> {
  const { client, admin } = await requireReservation(id);
  if (!z.literal("on").safeParse(form.get("confirm")).success)
    return { message: "Confirm that you want to cancel this area." };
  const { error } = await client.rpc("advertiser_manage", {
    p_booking: id,
    p_action: "cancel",
    p: {},
  });
  if (error)
    return {
      message: "This reservation cannot be canceled online. Contact support.",
    };
  try {
    await removeSavedCard(admin, getStripe(), id);
  } catch {
    /* The existing retry job handles unavailable card services. */
  }
  await processOutboxForBooking(admin, id).catch(() => {});
  revalidatePath("/dashboard");
  redirect(`/dashboard/${id}`);
}
export async function requestRevision(id: string, raw: unknown) {
  const { admin, user } = await requireReservation(id);
  try {
    return await beginDraft(admin, user.id, id, raw);
  } catch {
    return { ok: false as const, reason: "error" as const };
  }
}
export async function finalizeRevision(id: string, raw: unknown) {
  const { admin, user } = await requireReservation(id);
  try {
    return await finalizeDraft(admin, user.id, id, raw);
  } catch {
    return { ok: false as const, reason: "error" as const };
  }
}
export async function saveRevision(id: string, raw: unknown) {
  const { client } = await requireReservation(id);
  const parsed = RevisionLayout.safeParse(raw);
  if (!parsed.success)
    return { ok: false as const, reason: "invalid_input" as const };
  const { artworkId, crop, zoom } = parsed.data;
  const { error } = await client.rpc("advertiser_manage", {
    p_booking: id,
    p_action: "artwork",
    p: { draft_id: artworkId, ...crop, zoom },
  });
  if (error) return { ok: false as const, reason: "error" as const };
  revalidatePath(`/dashboard/${id}`);
  return { ok: true as const };
}
// Removing/abandoning a staged image never removes the reservation's currently saved artwork.
export async function discardRevision(id: string) {
  await requireReservation(id);
  return { ok: true as const };
}
export async function noExtension() {
  return { ok: false as const, reason: "extension_limit" as const };
}
