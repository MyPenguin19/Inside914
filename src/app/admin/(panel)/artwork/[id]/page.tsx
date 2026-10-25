
import { bookingSizeLabel } from "@/lib/booking/products";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { AdPlacement } from "@/components/admin/ad-placement";
import { Badge, DetailList, EmptyState, LoadError, PageHeader, PanelSkeleton } from "@/components/admin/ui";
import { Card } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { reviewArtwork } from "@/app/admin/admin-actions";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { getBooking, listArtworkReviews, listEditions, listSlots, signArtwork } from "@/lib/admin/data";
import { artworkLabel, positionLabel } from "@/lib/admin/labels";
import { formatIssueMonth, formatTimestamp } from "@/lib/format-admin";
import { OriginalBackupPanel } from "@/components/admin/original-backup-panel";
import { layoutVersion } from "@/lib/print/layouts";

export default function ArtworkDetailPage({ params }: PageProps<"/admin/artwork/[id]">) {
  return (
    <Suspense fallback={<PanelSkeleton />}>
      <ArtworkDetail params={params} />
    </Suspense>
  );
}

async function ArtworkDetail({ params }: { params: PageProps<"/admin/artwork/[id]">["params"] }) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  let data;
  try {
    const booking = await getBooking(supabase, id);
    if (!booking) notFound();
    const [editions, slots, artwork, reviews] = await Promise.all([listEditions(supabase), listSlots(supabase, [booking.editionId]), signArtwork(id).catch(() => null), listArtworkReviews(supabase, id)]);
    data = { booking, edition: editions.find((e) => e.id === booking.editionId) ?? null, slots, artwork, reviews };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error; // notFound()
    console.error(error instanceof Error ? error.message : "admin artwork detail failed");
    return <LoadError what="this artwork" />;
  }

  const { booking: b, edition, slots, artwork, reviews } = data;
  const reviewable = Boolean(artwork && b.artworkId && b.artwork?.status === "ready" && b.artwork.cropped && !["released", "cancelled"].includes(b.status));
  const own = slots.filter((s) => b.claims.some((c) => c.slotId === s.id));
  const labels = new Map(slots.map((s) => [s.id, { label: s.label, side: s.side }]));

  return (
    <div className="flex flex-col gap-7">
      <div>
        <Link href="/admin/artwork" className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
          ← Artwork queue
        </Link>
        <div className="mt-2">
          <PageHeader title={b.contact?.businessName ?? "Artwork"} description={edition ? `${edition.zoneName} · ${formatIssueMonth(edition.issueMonth)}` : undefined}>
            <Badge label={artworkLabel(b)} />
          </PageHeader>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-4"><OriginalBackupPanel bookingId={id} />{artwork && own.length ? <AdPlacement layoutKey={edition?.layoutTemplate} dimensions={edition?.productModel === "square_v1" ? {width:9,height:6} : undefined} artwork={artwork} own={own} slots={slots} /> : <EmptyState title="No artwork uploaded." />}</div>
        <Card>
          <h2 className="text-lg font-semibold">Details</h2>
          <div className="mt-4">
            <DetailList
              rows={[
                ["Campaign", edition ? <Link href={`/admin/campaigns/${edition.id}`} className="underline underline-offset-4">{edition.name ?? `${edition.zoneName} · ${formatIssueMonth(edition.issueMonth)}`}</Link> : "Unavailable"],
                ["Layout", layoutVersion(edition?.layoutTemplate)],
                ["Position", positionLabel(b, labels)],
                ["Size", bookingSizeLabel(b.size)],
                ["Uploaded / last positioned", formatTimestamp(b.artwork?.updatedAt ?? null)],
                ["Reservation", b.reference ?? "Not confirmed"],
                ["Content review", b.artworkReview === "approved" ? "Approved" : b.artworkReview === "rejected" ? "Rejected" : b.artworkReview === "changes_requested" ? "Changes requested" : "Not reviewed yet"],
                ["Print ready", "Not assessed (printer specifications pending)"],
              ]}
            />
          </div>
          {b.artworkReviewNote && <p className="mt-4 rounded-xl bg-background-soft px-3 py-2 text-sm">Latest note: {b.artworkReviewNote}</p>}

          <div className="mt-6">
            <h3 className="font-medium">Review</h3>
            {reviewable && b.artworkId ? (
              <div className="mt-3 flex flex-wrap items-start gap-3">
                <ConfirmAction label="Approve content" action={reviewArtwork} fields={{ artwork_id: b.artworkId, decision: "approved" }} confirmLabel="Approve"
                  consequence={<>Approves this exact upload. If a new file is ever uploaded, it needs a new review. This doesn&apos;t mark it print-ready.</>} />
                <ConfirmAction label="Request changes" action={reviewArtwork} fields={{ artwork_id: b.artworkId, decision: "changes_requested" }} reasonLabel="What should the advertiser change?" confirmLabel="Request changes"
                  consequence={<>Records your request. The reservation stays. Sending it to the advertiser and a re-upload link are a later task, so contact them directly for now.</>} />
                <ConfirmAction label="Reject" action={reviewArtwork} fields={{ artwork_id: b.artworkId, decision: "rejected" }} reasonLabel="Reason for rejecting" confirmLabel="Reject" tone="danger"
                  consequence={<>Marks this ad as not acceptable. The reservation is not canceled; that&apos;s a separate action.</>} />
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">This artwork can&apos;t be reviewed: it&apos;s missing, not positioned, or the booking has ended.</p>
            )}
          </div>

          {reviews.length > 0 && (
            <div className="mt-6">
              <h3 className="font-medium">Review history</h3>
              <ul className="mt-2 grid gap-2 text-sm">
                {reviews.map((r) => (
                  <li key={r.id} className="rounded-xl bg-background-soft px-3 py-2">
                    <span className="font-medium">{r.decision === "approved" ? "Approved" : r.decision === "rejected" ? "Rejected" : "Changes requested"}</span>
                    {r.artwork_id !== b.artworkId && <span className="text-muted"> (an earlier upload)</span>}
                    <span className="text-muted"> · {formatTimestamp(r.created_at)}</span>
                    {r.note && <p className="mt-0.5">{r.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link href={`/admin/advertisers/${b.id}`} className="mt-5 inline-block text-sm underline-offset-4 hover:underline">
            Open advertiser →
          </Link>
        </Card>
      </div>
    </div>
  );
}
