import { cancelBooking, flagBooking } from "@/app/admin/admin-actions";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Notice } from "@/components/ui/primitives";
import { isConfirmed, isLiveHold, type AdminBooking } from "@/lib/admin/metrics";
import { formatTimestamp } from "@/lib/format-admin";

// Flag / unflag and the protected cancellation. Paid or payment-in-flight reservations can't be
// canceled here (the database refuses them too); nothing is ever deleted or refunded.
export function ReservationActions({ booking: b, spaces, now }: { booking: AdminBooking; spaces: string[]; now: number }) {
  const ended = b.status === "released" || b.status === "cancelled";
  const paymentState = b.status === "charged" || b.status === "charge_failed";
  const live = isConfirmed(b) || isLiveHold(b, now);
  return (
    <div className="flex flex-col gap-3">
      {b.cancellation && (
        <Notice tone="neutral" role="note">
          Canceled {formatTimestamp(b.cancellation.at)}: {b.cancellation.reason}
        </Notice>
      )}
      {b.flag && (
        <Notice tone="warning" role="note">
          Flagged for investigation {formatTimestamp(b.flag.at)}: {b.flag.reason}
        </Notice>
      )}
      <div className="flex flex-wrap items-start gap-3">
        {b.flag ? (
          <ConfirmAction label="Clear flag" action={flagBooking} fields={{ booking_id: b.id, clear: "true" }} confirmLabel="Clear flag" consequence={<>Removes the investigation flag. The change is recorded.</>} />
        ) : (
          <ConfirmAction label="Flag for investigation" action={flagBooking} fields={{ booking_id: b.id }} reasonLabel="What needs looking into?" confirmLabel="Flag" consequence={<>Marks this reservation for follow-up. Nothing changes for the customer.</>} />
        )}
        {!ended && !paymentState && live && (
          <ConfirmAction
            label={isConfirmed(b) ? "Cancel reservation" : "Release hold"}
            action={cancelBooking}
            fields={{ booking_id: b.id }}
            reasonLabel="Reason for canceling (kept on record)"
            confirmLabel={isConfirmed(b) ? "Cancel reservation" : "Release hold"}
            tone="danger"
            consequence={
              <>
                {spaces.length === 2 ? "Both spaces" : "The space"} {spaces.join(" + ")} will be released together and become available again.
                The booking, its history and the advertiser&apos;s details are kept. No card is charged or refunded.
                {isConfirmed(b) && <> The customer is emailed that it was canceled, and their saved card is removed from Stripe.</>}
              </>
            }
          />
        )}
      </div>
      {paymentState && (
        <p className="text-sm text-muted">This reservation has a payment state, so it can&apos;t be canceled here. It needs the payment-resolution workflow (a later task).</p>
      )}
    </div>
  );
}
