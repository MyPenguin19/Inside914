"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdvertiser } from "@/lib/advertiser/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlanInput } from "@/lib/recurring/schedule";
import {
  beginOccurrence,
  ownedPlan,
  occurrenceToken,
} from "@/lib/recurring/service";
import { CART_COOKIE, cartById, ownedCart } from "@/lib/booking/cart";
import {
  allowHoldAttempt,
  clientAddress,
  visitorHash,
} from "@/lib/booking/hold-rate-limit";
import { getServerEnv } from "@/lib/env/server";
export type RecurringState = { message?: string };
export async function createPlan(
  _state: RecurringState,
  form: FormData,
): Promise<RecurringState> {
  const { client } = await requireAdvertiser();
  const parsed = PlanInput.safeParse({
    name: form.get("name"),
    sources: form.getAll("sources"),
    startMonth: form.get("startMonth"),
    endMonth: form.get("endMonth"),
    interval: form.get("interval"),
  });
  if (!parsed.success)
    return {
      message:
        "Choose one to four distinct areas, a name and a valid schedule of up to two years.",
    };
  const p = parsed.data;
  const claim = await client.rpc("claim_advertiser_bookings");
  if (claim.error) return { message: "Could not load your reservations." };
  const { data, error } = await client.rpc("recurring_plan_manage", {
    p_id: "00000000-0000-4000-8000-000000000000",
    p_action: "create",
    p: {
      name: p.name,
      sources: p.sources,
      start_month: `${p.startMonth}-01`,
      end_month: `${p.endMonth}-01`,
      interval_months: p.interval,
    },
  });
  if (error)
    return {
      message:
        error.code === "23505"
          ? "An existing plan already uses these reservations. Manage that plan instead."
          : "Use your own confirmed reservations, one per area, and start after their campaign months.",
    };
  revalidatePath("/dashboard/recurring");
  redirect(`/dashboard/recurring/${data}`);
}
export async function changePlan(
  id: string,
  _state: RecurringState,
  form: FormData,
): Promise<RecurringState> {
  const { client } = await requireAdvertiser();
  const parsed = z
    .object({ id: z.uuid(), status: z.enum(["active", "paused", "cancelled"]) })
    .safeParse({ id, status: form.get("status") });
  if (!parsed.success) return { message: "Invalid plan change." };
  const { error } = await client.rpc("recurring_plan_manage", {
    p_id: id,
    p_action: parsed.data.status,
    p: {},
  });
  if (error) return { message: "Plan unavailable or already cancelled." };
  revalidatePath("/dashboard/recurring");
  return {
    message:
      "Plan updated. Existing reservations and checkout holds are unchanged.",
  };
}
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 86400,
};
export async function prepareOccurrence(
  id: string,
  month: string,
  _state: RecurringState,
  form: FormData,
): Promise<RecurringState> {
  const { user } = await requireAdvertiser();
  if (
    !z.uuid().safeParse(id).success ||
    !/^\d{4}-\d{2}-01$/.test(month) ||
    form.get("confirm") !== "on"
  )
    return { message: "Confirm that you reviewed this occurrence." };
  const total = z.coerce.number().int().positive().safeParse(form.get("total"));
  if (!total.success) return { message: "Reload to review the current price." };
  const db = createAdminClient();
  if (
    !(await allowHoldAttempt(
      db,
      visitorHash(
        `recurring:${clientAddress(await headers())}`,
        getServerEnv().SUPABASE_SECRET_KEY,
      ),
    ))
  )
    return { message: "Please wait a few minutes before trying again." };
  const existing = await ownedCart(
    db,
    (await cookies()).get(CART_COOKIE)?.value,
  );
  if (
    existing?.members.some(
      (b) =>
        b.status === "pending" &&
        b.holdExpiresAt &&
        Date.parse(b.holdExpiresAt) > Date.now(),
    )
  )
    return { message: "Finish or release your existing area checkout first." };
  try {
    const cart = await beginOccurrence(db, user.id, id, month, total.data);
    (await cookies()).set(CART_COOKIE, cart.token, options);
  } catch (e) {
    return {
      message:
        e instanceof Error ? e.message : "Could not prepare this occurrence.",
    };
  }
  redirect("/book/cart");
}
export async function resumeOccurrence(id: string, month: string) {
  const { user } = await requireAdvertiser();
  if (!z.uuid().safeParse(id).success || !/^\d{4}-\d{2}-01$/.test(month))
    redirect("/dashboard/recurring");
  const db = createAdminClient();
  await ownedPlan(db, user.id, id);
  const { data: occ } = await db
    .from("recurring_occurrences")
    .select("*")
    .eq("plan_id", id)
    .eq("issue_month", month)
    .maybeSingle();
  if (!occ) redirect(`/dashboard/recurring/${id}`);
  const members = await cartById(db, occ.cart_id);
  if (
    !members.length ||
    members.some(
      (b) =>
        b.status !== "pending" ||
        !b.holdExpiresAt ||
        Date.parse(b.holdExpiresAt) <= Date.now(),
    )
  )
    redirect(`/dashboard/recurring/${id}`);
  const existing = await ownedCart(
    db,
    (await cookies()).get(CART_COOKIE)?.value,
  );
  if (
    existing &&
    existing.id !== occ.cart_id &&
    existing.members.some(
      (b) =>
        b.status === "pending" &&
        b.holdExpiresAt &&
        Date.parse(b.holdExpiresAt) > Date.now(),
    )
  )
    redirect("/book/cart");
  (await cookies()).set(CART_COOKIE, occurrenceToken(occ.nonce), options);
  redirect("/book/cart");
}
