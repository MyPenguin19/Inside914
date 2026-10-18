import { setCampaignStatus } from "@/app/admin/admin-actions";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { ExtendDeadlineForm } from "@/components/admin/extend-deadline-form";
import { Notice } from "@/components/ui/primitives";
import { deadlineMissed, type AdminEdition, type CampaignStats } from "@/lib/admin/metrics";
import { formatDay, formatDeadline } from "@/lib/format-admin";

// Only the actions valid for the campaign's current state are offered; the database checks
// every rule again (including the opening requirements) and records each change.
export function CampaignStatusControls({ edition: e, stats, now }: { edition: AdminEdition; stats: CampaignStats; now: number }) {
  const f = (action: string) => ({ id: e.id, action });
  const controls: React.ReactNode[] = [];
  const missed = deadlineMissed(e, stats, now);
  if (e.status === "draft" || e.status === "closed") {
    controls.push(
      <ConfirmAction key="open" label="Open for reservations" action={setCampaignStatus} fields={f("open")} confirmLabel="Open now"
        consequence={<>Customers will be able to see this campaign and hold its {stats.totalUnits - stats.blockedUnits} sellable spaces. Requirements (deadline, layout, spaces, prices, no other open campaign in this area) are checked first.</>} />,
    );
  }
  if (e.status === "open" && !e.pausedAt) {
    controls.push(
      <ConfirmAction key="pause" label="Pause new reservations" action={setCampaignStatus} fields={f("pause")} confirmLabel="Pause"
        consequence={<>No one can start a new hold. Existing reservations stay, and customers already in checkout can still finish.</>} />,
    );
  }
  if (e.status === "open" && e.pausedAt) {
    controls.push(
      <ConfirmAction key="resume" label="Resume reservations" action={setCampaignStatus} fields={f("resume")} confirmLabel="Resume"
        consequence={<>Customers can hold spaces again until the reservation deadline.</>} />,
    );
  }
  if (e.status === "open") {
    controls.push(
      <ConfirmAction key="close" label="Close reservations" action={setCampaignStatus} fields={f("close")} confirmLabel="Close" tone="danger"
        consequence={<>Stops new holds, and holds still in checkout can no longer be confirmed. The {stats.reservations} confirmed {stats.reservations === 1 ? "reservation stays" : "reservations stay"} as they are. Nothing is charged.</>} />,
    );
  }
  if (missed && stats.reservations > 0) {
    controls.push(
      <ConfirmAction key="cancel" label="Cancel campaign (didn't fill)" action={setCampaignStatus} fields={f("cancel")} confirmLabel="Cancel campaign and reservations" tone="danger"
        consequence={<>All {stats.reservations} confirmed {stats.reservations === 1 ? "reservation is" : "reservations are"} canceled. Each customer is emailed that the campaign didn&apos;t fill, nobody is charged, and every saved card is removed from Stripe. This can&apos;t be undone.</>} />,
    );
  } else if (["draft", "open", "closed"].includes(e.status) && stats.reservations === 0) {
    controls.push(
      <ConfirmAction key="cancel" label="Cancel campaign" action={setCampaignStatus} fields={f("cancel")} confirmLabel="Cancel campaign" tone="danger"
        consequence={<>The campaign is marked canceled and can no longer be opened or edited. Only possible while it has no confirmed reservations.</>} />,
    );
  }
  if (e.status === "closed") {
    controls.push(
      <ConfirmAction key="approve" label="Approve for print" action={setCampaignStatus} fields={f("approve_for_print")} confirmLabel="Approve"
        consequence={<>Records that the owner approved this campaign for production. Every sellable space must be reserved and every reservation needs approved artwork. This does not charge anyone.</>} />,
    );
  }
  if (e.status === "approved_to_print") {
    controls.push(
      <ConfirmAction key="printed" label="Mark as printed" action={setCampaignStatus} fields={f("mark_printed")} confirmLabel="Mark printed"
        consequence={<>Needs a printer confirmation uploaded as evidence. Printed is not mailed.</>} />,
    );
  }
  if (e.status === "printed") {
    controls.push(
      <ConfirmAction key="mailed" label="Mark as mailed" action={setCampaignStatus} fields={f("mark_mailed")} confirmLabel="Mark mailed"
        consequence={<>Needs a postal acceptance or mailing confirmation uploaded as evidence. Postal acceptance is not proof of delivery to each home.</>} />,
    );
  }
  if (e.status === "mailed") {
    controls.push(
      <ConfirmAction key="complete" label="Mark as completed" action={setCampaignStatus} fields={f("complete")} confirmLabel="Complete"
        consequence={<>Closes out the campaign. It can&apos;t be edited afterwards.</>} />,
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {missed && (
        <Notice tone="danger" role="alert">
          <strong>Deadline passed: {stats.reservedUnits} of {stats.sellableUnits} spaces reserved.</strong> The reservation deadline ({formatDeadline(e.artworkDeadline)}) passed before the
          campaign filled, so it can&apos;t be printed as is. Extend the deadline, or cancel the campaign. Customers aren&apos;t told anything until you choose.
        </Notice>
      )}
      {missed && (
        <details className="rounded-2xl border border-line bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium">Extend the deadline</summary>
          <div className="mt-4">
            <ExtendDeadlineForm
              editionId={e.id}
              artworkDue={e.artworkDueAt ? formatDeadline(e.artworkDueAt) : ""}
              windowStart={e.mailingWindowStart ? formatDay(e.mailingWindowStart) : ""}
              windowEnd={e.mailingWindowEnd ? formatDay(e.mailingWindowEnd) : ""}
            />
          </div>
        </details>
      )}
      {controls.length ? (
        <div className="flex flex-wrap items-start gap-3">{controls}</div>
      ) : (
        <p className="text-sm text-muted">No status changes are available for a {e.status} campaign.</p>
      )}
    </div>
  );
}
