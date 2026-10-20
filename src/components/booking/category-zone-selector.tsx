"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { BookingSteps } from "./booking-steps";
import { PostcardSide } from "@/components/postcard/postcard-side";
import { REGIONS } from "@/lib/catalog/regions";
import type { EditionCatalog } from "@/lib/catalog/queries";
import { formatPrice } from "@/lib/format";
import { holdAreas } from "@/app/book/cart/actions";
export type CategoryCatalog = { editions: EditionCatalog[] };
export function CategoryZoneSelector({ editions }: CategoryCatalog) {
  const [selected, setSelected] = useState<string[]>([]);
  const [positions, setPositions] = useState<Record<string, string>>({});
  const [step, setStep] = useState<1 | 2>(1);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const chosen = editions.filter(e => selected.includes(e.id));
  const total = chosen.reduce((n, e) => n + e.unitPriceCents, 0);
  const homes = chosen.reduce((n, e) => n + e.households, 0);
  return <div className="space-y-6">
    <BookingSteps current={step} />
    {step === 1 ? <div className="grid gap-4 md:grid-cols-2">
      {REGIONS.map(region => {
        const e = editions.find(e => e.zoneSlug === region.slug);
        const available = !!e && e.bookable && e.availableUnits > 0;
        const status = !e || !e.bookable ? "Not open" : e.availableUnits === 0 ? "Full" : "Available";
        return <Card key={region.slug}><label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-accent" disabled={!available || pending} checked={!!e && selected.includes(e.id)} onChange={event => { if (e) setSelected(event.target.checked ? [...selected, e.id] : selected.filter(id => id !== e.id)); }} />
          <span><span className="block text-lg font-semibold">{region.name}</span><span className="block text-sm text-muted">{status}{e ? ` · ${formatPrice(e.unitPriceCents)} per square ad` : ""}</span></span>
        </label></Card>;
      })}
    </div> : <div className="space-y-8">
      <h2 className="text-2xl font-semibold">Choose one square in each area</h2>
      <p>Next, upload a different image for each area or reuse the same image.</p>
      {chosen.map(e => <section key={e.id} aria-label={e.zoneName} className="space-y-3">
        <h3 className="text-xl font-semibold">{e.zoneName}</h3>
        <div className="grid gap-4 lg:grid-cols-2">{(["front", "back"] as const).map(side => <PostcardSide key={side} side={side} dimensions={{ width: 9, height: 6 }} priceCents={e.unitPriceCents}
          views={e.slots.filter(s => s.side === side).map(slot => ({ slot, selected: positions[e.id] === slot.id, selectable: slot.available && !pending, note: slot.available ? "Available" : "Unavailable" }))}
          onSelect={slotId => { if (!pending) setPositions(previous => ({ ...previous, [e.id]: slotId })); }} />)}</div>
        <p className="text-sm text-muted">Selected: {e.slots.find(s => s.id === positions[e.id])?.label ?? "Choose a square"}. The unmarked back area is reserved for house ads and postal information.</p>
      </section>)}
      <Button variant="secondary" disabled={pending} onClick={() => setStep(1)}>Change areas</Button>
    </div>}
    <Card><h2 className="text-xl font-semibold">Selected: {chosen.length} areas</h2>
      <p className="mt-2 text-muted">{homes > 0 ? `Potential combined reach: approximately ${homes.toLocaleString()} households, provisional.` : "Household reach awaits confirmation."}</p>
      <p className="mt-3 font-semibold">Maximum authorized total: {formatPrice(total)}</p><p>Due today: $0</p>
      <p className="my-3 text-sm text-muted">Save your card at checkout. Each area is charged separately at $399 only after all 10 spaces are reserved and the campaign is approved.</p>
      {step === 1 ? <Button disabled={!chosen.length} onClick={() => { setStep(2); setMessage(""); }}>Continue with selected areas</Button> :
        <Button disabled={!chosen.length || chosen.some(e => !positions[e.id]) || pending} onClick={() => start(async () => {
          const result = await holdAreas({ selections: chosen.map(e => ({ editionId: e.id, slotId: positions[e.id] })) });
          if (result.ok) router.push("/book/cart");
          else { setMessage(result.message ?? "Please try again."); setPositions({}); router.refresh(); }
        })}>{pending ? "Holding your squares…" : "Continue to artwork"}</Button>}
      {message && <p role="alert" className="mt-3">{message}</p>}
      <p className="mt-3"><Link href="/book/cart" className="underline">Return to held areas</Link></p>
    </Card>
  </div>;
}
