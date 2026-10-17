import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { AdPlacement } from "@/components/admin/ad-placement";
import { Badge, DetailList, LoadError, PageHeader, PanelSkeleton } from "@/components/admin/ui";
import { DataTable } from "@/components/ui/data-table";
import { Card, Notice } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { getBooking, getConsent, listEditions, listSlots, searchBookings, signArtwork } from "@/lib/admin/data";
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
    const [editions, slots, consent, artwork, history] = await Promise.all([
      listEditions(supabase),
      listSlots(supabase, [booking.editionId]),
      getConsent(supabase, id),
      signArtwork(id),
      booking.contact ? searchBookings(supabase, { filter: "all", q: booking.contact.email, page: 1 }) : null,
    ]);
    data = { booking, edition: editions.find((e) => e.id === booking.editionId) ?? null, slots, consent, artwork, history: history?.rows ?? [] };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error; // notFound()
    console.error(error instanceof Error ? error.message : "admin advertiser failed");
    return <LoadError what="this advertiser" />;
  }

  const { booking: b, edition, slots, consent, artwork, history } = data;
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
                  ["Size", b.size === "double" ? `Double (${b.claims.filter((c) => !c.released).length} units)` : "Standard (1 unit)"],
                  ["Reference", b.reference ?? "—"],
                  ["Status", <Badge key="s" label={reservationLabel(b, now)} />],
                  ["Hold started", formatTimestamp(b.createdAt)],
                  ["Confirmed", formatTimestamp(b.confirmedAt)],
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
                  ["Collected", "$0 (payment collection isn't built yet)"],
                ]}
              />
            </div>
          </Card>

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
                    h.size === "double" ? "Double" : "Standard",
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
            <AdPlacement artwork={artwork} own={own} slots={slots} />
          ) : (
            <p className="text-sm text-muted">No artwork uploaded.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
