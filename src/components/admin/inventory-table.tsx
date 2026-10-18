import Link from "next/link";
import { setSlotBlock } from "@/app/admin/admin-actions";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Badge } from "@/components/admin/ui";
import { DataTable } from "@/components/ui/data-table";
import { artworkLabel } from "@/lib/admin/labels";
import type { AdminBooking, AdminSlot, SlotState } from "@/lib/admin/metrics";
import { formatTimestamp } from "@/lib/format-admin";

const STATE: Record<SlotState["state"], { text: string; tone: "success" | "info" | "neutral" | "warning" }> = {
  available: { text: "Available", tone: "success" },
  held: { text: "On hold", tone: "info" },
  reserved: { text: "Reserved", tone: "neutral" },
  blocked: { text: "Blocked", tone: "warning" },
  closed: { text: "Not bookable", tone: "neutral" },
};

// Every space with who occupies it. Only unclaimed spaces can be blocked; occupied spaces can't be
// reassigned here, and a double ad's two units always appear as one reservation.
export function InventoryTable({ slots, states, expired }: { slots: AdminSlot[]; states: Map<string, SlotState>; expired: AdminBooking[] }) {
  const label = new Map(slots.map((s) => [s.id, s.label]));
  return (
    <div className="flex flex-col gap-4">
      <DataTable
        caption="Advertising spaces"
        columns={["Space", "State", "Advertiser", "Size", "Artwork", "Details", "Action"]}
        rows={slots.map((s) => {
          const st = states.get(s.id)!;
          const b = st.booking;
          const partner = b?.size === "double" ? b.claims.filter((c) => !c.released && c.slotId !== s.id).map((c) => label.get(c.slotId)).join("") : null;
          return [
            <span key="l" className="font-medium">
              {s.side === "front" ? "Front" : "Back"} {s.label}
            </span>,
            <Badge key="s" label={STATE[st.state]} />,
            b ? (
              <Link key="a" href={`/admin/advertisers/${b.id}`} className="underline-offset-4 hover:underline">
                {b.contact?.businessName ?? "Checkout in progress"}
              </Link>
            ) : (
              "—"
            ),
            b ? (b.size === "double" ? `Double (with ${partner})` : "Standard") : "—",
            b ? <Badge key="w" label={artworkLabel(b)} /> : "—",
            st.state === "held" && b?.holdExpiresAt
              ? `Hold ends ${formatTimestamp(b.holdExpiresAt)}`
              : st.state === "blocked"
                ? `Blocked: ${s.blockedReason ?? "no reason"}`
                : "—",
            st.state === "blocked" ? (
              <ConfirmAction key="u" label="Unblock" action={setSlotBlock} fields={{ slot_id: s.id, block: "false" }} confirmLabel="Unblock"
                consequence={<>Space {s.label} becomes sellable again (bookable whenever the campaign is open).</>} />
            ) : st.state === "available" || st.state === "closed" ? (
              <ConfirmAction key="b" label="Block" action={setSlotBlock} fields={{ slot_id: s.id, block: "true" }} confirmLabel="Block space" reasonLabel="Reason (internal)"
                consequence={<>Space {s.label} is taken off sale. It is not sold, doesn&apos;t count as reserved, and lowers the campaign&apos;s sellable capacity.</>} />
            ) : (
              <span key="n" className="text-xs text-muted">Occupied</span>
            ),
          ];
        })}
      />
      {expired.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
          <p className="font-medium">Expired holds ({expired.length})</p>
          <p className="mt-1 text-muted">These holds ran out before checkout finished. Their spaces count as free and are released automatically on the next hold attempt.</p>
          <ul className="mt-2 grid gap-1">
            {expired.slice(0, 10).map((b) => (
              <li key={b.id}>
                {b.claims.map((c) => label.get(c.slotId)).join(" + ")} · ended {formatTimestamp(b.holdExpiresAt)}
                {b.contact ? ` · ${b.contact.businessName}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
