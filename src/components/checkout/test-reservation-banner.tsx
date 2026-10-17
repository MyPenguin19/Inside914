// Unmissable label for development TEST reservations.
export function TestReservationBanner() {
  return (
    <p
      role="note"
      className="rounded-2xl border-2 border-dashed border-warning-line bg-warning-soft px-5 py-4 text-sm font-medium text-warning"
    >
      TEST RESERVATION (development only): this is not a real booking. No card was saved, no payment was authorized and
      no email was sent.
    </p>
  );
}
