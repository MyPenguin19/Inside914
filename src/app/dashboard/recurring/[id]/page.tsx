import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdvertiser } from "@/lib/advertiser/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ownedPlan,
  reviewOccurrence,
  isPendingOccurrence,
} from "@/lib/recurring/service";
import { scheduledMonths } from "@/lib/recurring/schedule";
import { cartById } from "@/lib/booking/cart";
import { formatIssueMonth, formatPrice } from "@/lib/format";
import { bookingSizeLabel } from "@/lib/booking/products";
import { PlanControls, OccurrenceForm } from "../forms";
import { resumeOccurrence } from "../actions";
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
};
export default function Page(props: Props) {
  return (
    <Suspense fallback={<p>Loading your schedule…</p>}>
      <Plan {...props} />
    </Suspense>
  );
}
async function Plan({ params, searchParams }: Props) {
  const { user } = await requireAdvertiser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = createAdminClient();
  const plan = await ownedPlan(db, user.id, id).catch(() => null);
  if (!plan) notFound();
  const months = scheduledMonths(plan);
  const { month } = await searchParams;
  if (month && !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(month)) notFound();
  const { data: occurrences, error } = await db
    .from("recurring_occurrences")
    .select("*")
    .eq("plan_id", id);
  if (error) throw error;
  const history = await Promise.all(
    (occurrences ?? []).map(async (o) => ({
      ...o,
      members: await cartById(db, o.cart_id),
    })),
  );
  let review: Awaited<ReturnType<typeof reviewOccurrence>> | null = null;
  let message = "";
  if (month) {
    try {
      review = await reviewOccurrence(db, user.id, id, month);
    } catch (e) {
      message = e instanceof Error ? e.message : "Campaign unavailable.";
    }
  }
  return (
    <div className="space-y-6">
      <Link href="/dashboard/recurring" className="underline">
        All recurring plans
      </Link>
      <h1 className="text-3xl font-semibold break-words">{plan.name}</h1>
      <p>
        Plan status: <strong>{plan.status}</strong> ·{" "}
        {plan.interval_months === 1 ? "Monthly" : "Quarterly"}
      </p>
      <PlanControls id={id} status={plan.status} />
      <p>
        Each occurrence needs fresh artwork review and checkout confirmation.
        Changing this plan does not change existing reservations or held
        checkouts.
      </p>
      <h2 className="text-xl font-semibold">Scheduled occurrences</h2>
      <ul className="space-y-3">
        {months.map((m) => {
          const occurrence = history.find((o) => o.issue_month === m);
          const confirmed = occurrence?.members.some((b) => b.reference);
          const pending = occurrence && isPendingOccurrence(occurrence.members);
          return (
            <li
              key={m}
              className="rounded-2xl border border-line bg-surface p-5"
            >
              <h3 className="font-semibold">{formatIssueMonth(m)}</h3>
              {confirmed ? (
                <>
                  <p>
                    Reservation created; manage each area in your dashboard.
                  </p>
                  <Link href="/dashboard" className="underline">
                    View reservations
                  </Link>
                </>
              ) : pending ? (
                <form action={resumeOccurrence.bind(null, id, m)}>
                  <button className="underline">
                    Continue existing checkout
                  </button>
                </form>
              ) : plan.status === "active" ? (
                <Link
                  className="underline"
                  href={`/dashboard/recurring/${id}?month=${m}`}
                >
                  Review {formatIssueMonth(m)}
                </Link>
              ) : (
                <p>{plan.status === "paused" ? "Paused" : "Cancelled"}</p>
              )}
            </li>
          );
        })}
      </ul>
      {month && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">
            Review {formatIssueMonth(month)}
          </h2>
          {message && <p role="status">{message}</p>}
          {review && (
            <>
              {review.items.map((i) => (
                <div
                  key={i.sourceId}
                  className="rounded-2xl border border-line bg-surface p-5"
                >
                  <h3 className="font-semibold">{i.zoneName}</h3>
                  <p>
                    {bookingSizeLabel(i.mode)} · {formatPrice(i.priceCents)}
                    {i.pricingMode === "test" ? " · TEST price" : ""}
                  </p>
                  <p className="text-sm break-words">{i.positions}</p>
                  <p className="text-sm text-muted">
                    Your current source image will be copied if available.
                    Position it again or upload a different image during
                    checkout.
                  </p>
                </div>
              ))}
              <p className="font-semibold">
                Total for this occurrence: {formatPrice(review.total)}
              </p>
              <OccurrenceForm id={id} month={month} total={review.total} />
            </>
          )}
        </section>
      )}
    </div>
  );
}
