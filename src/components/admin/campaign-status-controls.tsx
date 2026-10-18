import { setCampaignStatus } from "@/app/admin/admin-actions";
import { ConfirmAction } from "@/components/admin/confirm-action";
import type { AdminEdition, CampaignStats } from "@/lib/admin/metrics";

// Only the actions valid for the campaign's current state are offered; the database checks
// every rule again (including the opening requirements) and records each change.
export function CampaignStatusControls({ edition: e, stats }: { edition: AdminEdition; stats: CampaignStats }) {
  const f = (action: string) => ({ id: e.id, action });
  const controls: React.ReactNode[] = [];
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
  if (["draft", "open", "closed"].includes(e.status) && stats.reservations === 0) {
    controls.push(
      <ConfirmAction key="cancel" label="Cancel campaign" action={setCampaignStatus} fields={f("cancel")} confirmLabel="Cancel campaign" tone="danger"
        consequence={<>The campaign is marked canceled and can no longer be opened or edited. Only possible while it has no confirmed reservations.</>} />,
    );
  }
  if (e.status === "closed") {
    controls.push(
      <ConfirmAction key="approve" label="Approve for print" action={setCampaignStatus} fields={f("approve_for_print")} confirmLabel="Approve"
        consequence={<>Records that the owner approved this campaign for production. Every confirmed reservation must have approved artwork. This does not charge anyone.</>} />,
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
  if (!controls.length) return <p className="text-sm text-muted">No status changes are available for a {e.status} campaign.</p>;
  return <div className="flex flex-wrap items-start gap-3">{controls}</div>;
}
