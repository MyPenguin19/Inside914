import { EmailDeliveryStatus } from "@/components/admin/email-delivery-status";

import { bookingSizeLabel } from "@/lib/booking/products";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { AdPlacement } from "@/components/admin/ad-placement";
import { Badge, DetailList, LoadError, PageHeader, PanelSkeleton } from "@/components/admin/ui";
import { DataTable } from "@/components/ui/data-table";
import { Card, Notice } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { NoteForm } from "@/components/admin/note-form";
import { ReservationActions } from "@/components/admin/reservation-actions";
import { getAccessStatus, getBooking, getConsent, listEditions, listEvents, listNotes, listSlots, searchBookings, signArtwork } from "@/lib/admin/data";
import { eventLabel } from "@/lib/admin/labels";
import { artworkLabel, paymentLabel, positionLabel, reservationLabel } from "@/lib/admin/labels";
import { formatDeadline, formatIssueMonth, formatPhone, formatPrice, formatTimestamp } from "@/lib/format-admin";

export default function AdvertiserDetailPage({ params }: PageProps<"/admin/advertisers/[id]">) {
  return (
    <Suspense fallback={<PanelSkeleton />}>
      <AdvertiserDetail params={params} />
    </Suspense>
  );
}

async function AdvertiserDetail({ params }: { params: PageProps<"/admin/advertisers/[id]">["params"] }) {
  const { supabase, now } = await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  let data;
  try {
    const booking = await getBooking(supabase, id);
    if (!booking) notFound();
    const [editions, slots, consent, artwork, history, notes, access, events] = await Promise.all([
      listEditions(supabase),
      listSlots(supabase, [booking.editionId]),
      getConsent(supabase, id),
      signArtwork(id),
      booking.contact ? searchBookings(supabase, { filter: "all", q: booking.contact.email, page: 1 }) : null,
      listNotes(supabase, id),
      getAccessStatus(supabase, id),
      listEvents(supabase, "booking", [id], 10),
    ]);
    data = { booking, edition: editions.find((e) => e.id === booking.editionId) ?? null, slots, consent, artwork, history: history?.rows ?? [], notes, access, events };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error; // notFound()
    console.error(error instanceof Error ? error.message : "admin advertiser failed");
    return <LoadError what="this advertiser" />;
  }

  const { booking: b, edition, slots, consent, artwork, history, notes, access, events } = data;
  const labels = new Map(slots.map((s) => [s.id, { label: s.label, side: s.side }]));
  const own = slots.filter((s) => b.claims.some((c) => c.slotId === s.id));
  const others = history.filter((h) => h.id !== b.id);

  return (
    <div className="flex flex-col gap-7">
      <div>
        <Link href="/admin/advertisers" className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
          ← All advertisers
        </Link>
        <div className="mt-2">
          <PageHeader title={b.contact?.businessName ?? "No business details yet"} description={b.reference ? `Reservation ${b.reference}` : "No reservation reference (not confirmed)"}>
            <Badge label={reservationLabel(b, now)} />
          </PageHeader>
        </div>
      </div>

      {b.pricingMode === "test" && (
        <Notice tone="warning" role="note">
          This booking uses the temporary test price ({formatPrice(b.priceCents)}).
        </Notice>
      )}

      <EmailDeliveryStatus bookingId={b.id} />
      <ReservationActions booking={b} spaces={own.map((s) => s.label)} now={now} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <h2 className="text-lg font-semibold">Business and contact</h2>
            <div className="mt-4">
              <DetailList
                rows={[
                  ["Business", b.contact?.businessName ?? "—"],
                  ["Contact", b.contact?.contactName ?? "—"],
                  ["Email", b.contact ? <a href={`mailto:${b.contact.email}`} className="underline-offset-4 hover:underline">{b.contact.email}</a> : "—"],
                  ["Phone", b.contact ? formatPhone(b.contact.phone) : "—"],
                ]}
              />
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Reservation</h2>
            <div className="mt-4">
              <DetailList
                rows={[
                  ["Campaign", edition ? <Link href={`/admin/campaigns/${edition.id}`} className="underline-offset-4 hover:underline">{edition.zoneName} · {formatIssueMonth(edition.issueMonth)}</Link> : "—"],
                  ["Reserve-by date", edition ? formatDeadline(edition.artworkDeadline) : "—"],
                  ["Position", positionLabel(b, labels)],
                  ["Size", `${bookingSizeLabel(b.size)} (${b.claims.filter((c) => !c.released).length} units)`],
                  ["Reference", b.reference ?? "—"],
                  ["Status", <Badge key="s" label={reservationLabel(b, now)} />],
                  ["Hold started", formatTimestamp(b.createdAt)],
                  ["Confirmed", formatTimestamp(b.confirmedAt)],
                  ["Customer's private link", access ? (access.revoked_at ? `Revoked ${formatTimestamp(access.revoked_at)}` : Date.parse(access.expires_at) < now ? `Expired ${formatTimestamp(access.expires_at)}` : `Active until ${formatTimestamp(access.expires_at)}`) : "Not issued"],
                ]}
              />
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Payment authorization</h2>
            <p className="mt-1 text-xs text-muted">A saved card is not a payment. Nothing has been collected.</p>
            <div className="mt-4">
              <DetailList
                rows={[
                  ["Authorized future charge", `${formatPrice(b.priceCents)}${b.pricingMode === "test" ? " (test price)" : ""}`],
                  ["Card", <Badge key="p" label={paymentLabel(b)} />],
                  ["Stripe setup status", b.stripeSetupStatus ? `${b.stripeSetupStatus} · ${formatTimestamp(b.stripeSetupStatusAt)}` : b.stripeSetupIntentId ? "Started (no webhook result recorded)" : "Not started"],
                  ["Consent recorded", consent ? `${formatPrice(consent.amount_cents)} · ${formatTimestamp(consent.consented_at)}` : "No"],
                  ["Terms version", consent?.terms_version ?? "—"],
                  ["Consent review",consent?.reviewReason??"No deadline change recorded; collection remains separately gated"],
                  ["Collected", "$0 (payment collection isn't built yet)"],
                ]}
              />
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Internal notes</h2>
            {notes.length ? (
              <ul className="mt-3 grid gap-3">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-xl bg-background-soft px-3 py-2 text-sm">
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <p className="mt-1 text-xs text-muted">{formatTimestamp(n.created_at)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No notes yet.</p>
            )}
            <div className="mt-4">
              <NoteForm bookingId={b.id} />
            </div>
          </Card>

          {events.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold">Admin history</h2>
              <ul className="mt-3 grid gap-2 text-sm">
                {events.map((ev) => (
                  <li key={ev.id} className="flex justify-between gap-3">
                    <span>{eventLabel(ev.event_type)}</span>
                    <span className="text-xs text-muted">{formatTimestamp(ev.created_at)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {others.length > 0 && (
            <section aria-labelledby="history-title">
              <h2 id="history-title" className="text-lg font-semibold">
                Other bookings with this email
              </h2>
              <div className="mt-3">
                <DataTable
                  caption="Other bookings with this email"
                  columns={["Reference", "Status", "Size", "Amount", "Started"]}
                  rows={others.map((h) => [
                    <Link key="r" href={`/admin/advertisers/${h.id}`} className="underline-offset-4 hover:underline">
                      {h.reference ?? "No reference"}
                    </Link>,
                    <Badge key="s" label={reservationLabel(h, now)} />,
                    bookingSizeLabel(h.size),
                    formatPrice(h.priceCents),
                    formatTimestamp(h.createdAt),
                  ])}
                />
              </div>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Artwork</h2>
          <Badge label={artworkLabel(b)} />
          {artwork && own.length > 0 ? (
            <AdPlacement layoutKey={edition?.layoutTemplate} dimensions={edition?.productModel === "square_v1" ? {width:9,height:6} : undefined} artwork={artwork} own={own} slots={slots} />
          ) : (
            <p className="text-sm text-muted">No artwork uploaded.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
