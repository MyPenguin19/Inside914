import type { Tone } from "@/components/ui/primitives";
import { artworkAwaitingReview, isConfirmed, isLiveHold, paymentReadiness, type AdminBooking } from "./metrics";

// Plain-language status labels shared by every admin table and detail page.

export function reservationLabel(b: AdminBooking, now: number): { text: string; tone: Tone } {
  if (isConfirmed(b)) return { text: b.status === "reserved" ? "Reserved" : b.status.replace("_", " "), tone: "success" };
  if (isLiveHold(b, now)) return { text: "On hold", tone: "info" };
  if (b.status === "pending") return { text: "Hold expired", tone: "neutral" };
  return { text: b.status === "cancelled" ? "Canceled" : "Released", tone: "neutral" };
}

export function artworkLabel(b: AdminBooking): { text: string; tone: Tone } {
  if (!b.artwork) return { text: "No artwork", tone: "neutral" };
  if (b.artwork.status !== "ready") return { text: "Uploading", tone: "neutral" };
  if (!b.artwork.cropped) return { text: "Not positioned", tone: "warning" };
  if (b.artworkReview === "approved") return { text: "Content approved", tone: "success" };
  if (b.artworkReview === "rejected") return { text: "Rejected", tone: "danger" };
  if (b.artworkReview === "changes_requested") return { text: "Changes requested", tone: "warning" };
  if (artworkAwaitingReview(b)) return { text: "Awaiting review", tone: "warning" };
  return { text: "Submitted", tone: "neutral" };
}

const READINESS: Record<ReturnType<typeof paymentReadiness>, { text: string; tone: Tone }> = {
  ready: { text: "Card saved", tone: "success" },
  failed: { text: "Setup failed", tone: "danger" },
  canceled: { text: "Setup canceled", tone: "warning" },
  in_progress: { text: "Setup started", tone: "info" },
  not_started: { text: "No card", tone: "neutral" },
};

export const paymentLabel = (b: AdminBooking) => READINESS[paymentReadiness(b)];

export function positionLabel(b: AdminBooking, labels: Map<string, { label: string; side: string }>) {
  const own = b.claims.map((c) => labels.get(c.slotId)).filter(Boolean) as { label: string; side: string }[];
  if (!own.length) return "—";
  return `${own[0].side === "front" ? "Front" : "Back"} · ${own.map((s) => s.label).sort().join(" + ")}`;
}

export const editionLabel = (e: { zoneName: string; issueMonth: string }, month: (iso: string) => string) => `${e.zoneName} · ${month(e.issueMonth)}`;

const EVENTS: Record<string, string> = {
  "campaign.created": "Campaign created",
  "campaign.updated": "Campaign details changed",
  "campaign.open": "Opened for reservations",
  "campaign.pause": "New reservations paused",
  "campaign.resume": "Reservations resumed",
  "campaign.close": "Reservations closed",
  "campaign.cancel": "Campaign canceled",
  "campaign.approve_for_print": "Approved for print",
  "campaign.mark_printed": "Marked as printed",
  "campaign.mark_mailed": "Marked as mailed",
  "campaign.complete": "Completed",
  "slot.blocked": "Space blocked",
  "slot.unblocked": "Space unblocked",
  "booking.cancelled": "Reservation canceled",
  "booking.note_added": "Note added",
  "booking.flagged": "Flagged for investigation",
  "booking.unflagged": "Flag cleared",
  "artwork.approved": "Artwork content approved",
  "artwork.rejected": "Artwork rejected",
  "artwork.changes_requested": "Artwork changes requested",
  "evidence.uploaded": "Evidence uploaded",
  "evidence.published": "Evidence published",
  "evidence.unpublished": "Evidence unpublished",
};

export const eventLabel = (type: string) => EVENTS[type] ?? type;
