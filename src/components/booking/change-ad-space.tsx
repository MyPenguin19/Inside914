"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeAreaPosition } from "@/app/book/cart/actions";
import { PostcardSide } from "@/components/postcard/postcard-side";
import { Button, ButtonLink } from "@/components/ui/button";
import { CartHoldTimer } from "./cart-hold-timer";
import type { CatalogSlot } from "@/lib/booking/selection";
import { formatPrice } from "@/lib/format";

type Props = {
  bookingId: string; currentSlotId: string; slots: CatalogSlot[];
  layoutKey?: string | null; zoneName: string; priceCents: number;
  expiresAt: string; extensionUsed: boolean; changesOpen: boolean;
};
export function ChangeAdSpace({ bookingId, currentSlotId, slots, layoutKey, zoneName, priceCents, expiresAt, extensionUsed, changesOpen }: Props) {
  const [selected, setSelected] = useState(currentSlotId);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const current = slots.find(s => s.id === currentSlotId)!;
  const next = slots.find(s => s.id === selected);
  const canSave = changesOpen && !pending && selected !== currentSlotId && !!next?.available;
  function save() {
    if (!canSave) return;
    start(async () => {
      setMessage("");
      try {
        const result = await changeAreaPosition({ bookingId, currentSlotId, slotId: selected });
        if (result.ok) {
          router.push("/book/artwork?space=changed");
        } else {
          setMessage(result.message);
          setSelected(currentSlotId);
          router.refresh();
        }
      } catch {
        setMessage("Connection interrupted. Review your current space before trying again.");
      }
    });
  }
  return <div className="space-y-6">
    <header className="space-y-2">
      <h1 className="text-3xl font-semibold">Change ad space</h1>
      <p className="text-lg font-medium">{zoneName}</p>
      <p className="text-muted">Choose another available space, then save. Your current space stays held until the change is complete.</p>
      <p className="text-sm text-muted">Your saved artwork, price, and other areas stay the same.</p>
    </header>
    <CartHoldTimer expiresAt={expiresAt} extensionUsed={extensionUsed} />
    <p className="font-medium">Current space: {current.side === "front" ? "Front" : "Back"} · {current.label} · {formatPrice(priceCents)}</p>
    {!changesOpen && <p role="status">This campaign is not accepting space changes right now.</p>}
    <div className="grid gap-4 lg:grid-cols-2">
      {(["front", "back"] as const).map(side => <PostcardSide key={side} side={side} layoutKey={layoutKey}
        dimensions={{ width: 9, height: 6 }} priceCents={priceCents}
        views={slots.filter(s => s.side === side).map(slot => ({ slot, selected: selected === slot.id,
          selectable: changesOpen && !pending && (slot.available || slot.id === currentSlotId),
          note: slot.id === currentSlotId ? "Your current space" : slot.available ? "Available" : "Unavailable" }))}
        onSelect={id => { if (!pending && changesOpen && slots.some(s => s.id === id && (s.available || id === currentSlotId))) { setSelected(id); setMessage(""); } }} />)}
    </div>
    <section aria-label="Save ad space" aria-busy={pending} className="sticky bottom-0 z-20 space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-lg sm:bottom-3">
      <p aria-live="polite">{selected === currentSlotId ? "Select a new space above." : `New space: ${next?.side === "front" ? "Front" : "Back"} · ${next?.label}`}</p>
      <div className="flex flex-wrap gap-3">
        <Button disabled={!canSave} onClick={save}>{pending ? "Changing your space…" : "Save new space"}</Button>
        {!pending && <ButtonLink href="/book/cart" variant="secondary">Keep current space</ButtonLink>}
      </div>
      {message && <p role="alert">{message} <a className="underline" href="/book/cart">Review your areas</a></p>}
    </section>
  </div>;
}
