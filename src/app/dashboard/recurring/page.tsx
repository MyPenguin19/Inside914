import { Suspense } from "react";
import Link from "next/link";
import { requireAdvertiser } from "@/lib/advertiser/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getReservationView } from "@/lib/checkout/reservation";
import { bookingSizeLabel } from "@/lib/booking/products";
import { formatIssueMonth } from "@/lib/format";
import { PlanForm } from "./forms";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading recurring plans…</p>}>
      <Plans />
    </Suspense>
  );
}
async function Plans() {
  const { client } = await requireAdvertiser();
  const claim = await client.rpc("claim_advertiser_bookings");
  if (claim.error) throw new Error("Could not load reservations.");
  const [{ data: plans, error }, { data: links, error: linkError }] =
    await Promise.all([
      client
        .from("recurring_plans")
        .select("*")
        .order("created_at", { ascending: false }),
      client.from("advertiser_bookings").select("booking_id"),
    ]);
  if (error || linkError) throw new Error("Could not load plans.");
  const db = createAdminClient();
  const views = await Promise.all(
    (links ?? []).map((l) => getReservationView(db, l.booking_id)),
  );
  const sources = views
    .filter(
      (v) => v && !["cancelled", "released", "pending"].includes(v.status),
    )
    .map((v) => ({
      id: v!.bookingId,
      label: `${v!.zoneName} · ${formatIssueMonth(v!.issueMonth)} · ${bookingSizeLabel(v!.size)} · ${v!.reference}`,
    }));
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Recurring advertisements</h1>
      <p>
        Save a schedule for your areas. You review and confirm each occurrence
        when its campaigns open. Availability and current prices are checked
        each time; spaces are not guaranteed.
      </p>
      <p className="text-sm text-muted">
        Pausing or cancelling a plan stops future planning. Manage existing
        reservations or checkout holds separately. Household counts remain
        provisional.
      </p>
      <div className="space-y-3">
        {plans?.map((p) => (
          <div
            key={p.id}
            className="rounded-2xl border border-line bg-surface p-5"
          >
            <Link
              href={`/dashboard/recurring/${p.id}`}
              className="font-medium underline"
            >
              {p.name}
            </Link>
            <p className="text-sm">
              {p.status} · {p.interval_months === 1 ? "Monthly" : "Quarterly"} ·{" "}
              {formatIssueMonth(p.start_month)}–{formatIssueMonth(p.end_month)}
            </p>
          </div>
        ))}
      </div>
      <h2 className="text-xl font-semibold">Create a recurring plan</h2>
      {!sources.length && (
        <p>
          A confirmed reservation is needed first.{" "}
          <Link className="underline" href="/areas">
            Choose an area
          </Link>
          .
        </p>
      )}
      <PlanForm sources={sources} />
    </div>
  );
}
