import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { AdPlacement } from "@/components/admin/ad-placement";
import { Badge, DetailList, EmptyState, LoadError, PageHeader, PanelSkeleton } from "@/components/admin/ui";
import { Card } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { getBooking, listEditions, listSlots, signArtwork } from "@/lib/admin/data";
import { artworkLabel, positionLabel } from "@/lib/admin/labels";
import { formatIssueMonth, formatTimestamp } from "@/lib/format-admin";

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
    const [editions, slots, artwork] = await Promise.all([listEditions(supabase), listSlots(supabase, [booking.editionId]), signArtwork(id)]);
    data = { booking, edition: editions.find((e) => e.id === booking.editionId) ?? null, slots, artwork };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error; // notFound()
    console.error(error instanceof Error ? error.message : "admin artwork detail failed");
    return <LoadError what="this artwork" />;
  }

  const { booking: b, edition, slots, artwork } = data;
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
        <div>{artwork && own.length ? <AdPlacement artwork={artwork} own={own} slots={slots} /> : <EmptyState title="No artwork uploaded." />}</div>
        <Card>
          <h2 className="text-lg font-semibold">Details</h2>
          <div className="mt-4">
            <DetailList
              rows={[
                ["Position", positionLabel(b, labels)],
                ["Size", b.size === "double" ? "Double" : "Standard"],
                ["Uploaded / last positioned", formatTimestamp(b.artwork?.updatedAt ?? null)],
                ["Reservation", b.reference ?? "Not confirmed"],
                ["Review history", "Not recorded yet (review actions arrive in a later stage)"],
              ]}
            />
          </div>
          <Link href={`/admin/advertisers/${b.id}`} className="mt-5 inline-block text-sm underline-offset-4 hover:underline">
            Open advertiser →
          </Link>
        </Card>
      </div>
    </div>
  );
}
