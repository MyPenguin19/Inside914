"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BookingSteps } from "./booking-steps";
import { PostcardSide } from "@/components/postcard/postcard-side";
import { REGIONS } from "@/lib/catalog/regions";
import type { EditionCatalog } from "@/lib/catalog/queries";
import { formatPrice } from "@/lib/format";
import { WestchesterMap } from "./westchester-map";
import { AREA_GUIDE } from "./westchester-map-data";
import { holdAreas } from "@/app/book/cart/actions";
import { CHECKOUT_CLOSED_MESSAGE } from "@/lib/checkout/messages";
export type CategoryCatalog = { editions: EditionCatalog[] };
export function CategoryZoneSelector({ editions,checkoutOpen,invitation,invitationUnavailable=false }: CategoryCatalog & {checkoutOpen:boolean;invitation?:{editionId:string;slotId:string};invitationUnavailable?:boolean}) {
  const [selected, setSelected] = useState<string[]>(invitation?[invitation.editionId]:[]);
  const [positions, setPositions] = useState<Record<string, string>>(invitation?{[invitation.editionId]:invitation.slotId}:{});
  const [step, setStep] = useState<1 | 2>(1);
  const [activeArea, setActiveArea] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const chosen = editions.filter(e => selected.includes(e.id));
  const total = chosen.reduce((n, e) => n + e.unitPriceCents, 0);
  const homes = chosen.reduce((n, e) => n + e.households, 0);
  const positionsReady = chosen.length > 0 && chosen.every(e => e.bookable && e.slots.some(s => s.id === positions[e.id] && s.available));
  const hasPosition = (e: EditionCatalog) => e.bookable && e.slots.some(s => s.id === positions[e.id] && s.available);
  const currentArea = chosen.find(e => e.id === activeArea) ?? chosen[0];
  const nextArea = chosen.find(e => e.id !== currentArea?.id && !hasPosition(e));
  const selectedCount = chosen.filter(hasPosition).length;
  function focusStep() {
    requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
      headingRef.current?.scrollIntoView?.({ block: "start" });
    });
  }
  const mapAreas = REGIONS.map(region => {
    const edition = editions.find(e => e.zoneSlug === region.slug);
    return { slug: region.slug, selected: !!edition && selected.includes(edition.id),
      available: !!edition && edition.bookable && edition.availableUnits > 0 && !pending,
      status: !edition || !edition.bookable ? "Not open" : edition.availableUnits === 0 ? "Full" : checkoutOpen ? "Available" : "Preview only" };
  });
  const toggleArea = (slug: (typeof REGIONS)[number]["slug"]) => {
    const area = mapAreas.find(a => a.slug === slug);
    const edition = editions.find(e => e.zoneSlug === slug);
    if (!area?.available || !edition) return;
    setSelected(previous => previous.includes(edition.id) ? previous.filter(id => id !== edition.id) : [...previous, edition.id]);
  };
  return <div className="space-y-6">
    {invitation&&<p role="status" className="rounded-xl border border-line p-4">Your invited area and position are selected. Review them and continue below. Nothing is reserved until checkout is completed.</p>}
    {invitationUnavailable&&<p role="status" className="rounded-xl border border-line p-4">This invitation expired or its position is no longer available. Choose another open area and position below.</p>}
    <BookingSteps current={step} />
    {step === 1 ? <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <div className="order-2 lg:order-1"><WestchesterMap areas={mapAreas} onToggle={toggleArea} /></div>
      <div className="order-1 space-y-3 lg:order-2">
        <h2 ref={headingRef} tabIndex={-1} className="scroll-mt-24 text-xl font-semibold outline-none">Pick one or more areas</h2>
        {REGIONS.map(region => {
          const e = editions.find(e => e.zoneSlug === region.slug);
          const area = mapAreas.find(a => a.slug === region.slug)!;
          const guide = AREA_GUIDE[region.slug];
          return <div key={region.slug} className={`rounded-2xl border p-4 ${area.selected ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}>
            <label className={`flex items-start gap-3 ${area.available ? "cursor-pointer" : "cursor-not-allowed"}`}>
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-accent" disabled={!area.available} checked={area.selected} onChange={() => toggleArea(region.slug)} />
              <span className="min-w-0"><span className="block text-lg font-semibold">{region.name}</span>
                <span className="block text-sm text-muted">{area.status}{e ? ` · ${formatPrice(e.unitPriceCents)} per ad` : ""}</span>
                <span className="mt-2 block text-sm">{guide.municipalities.slice(0, 6).map(town => town.name).join(" · ")}</span>
              </span>
            </label>
            <details className="ml-8 mt-2 text-sm text-muted">
              <summary className="cursor-pointer">Area details</summary>
              <p className="mt-2">{guide.description}</p>
              {guide.municipalities.length > 6 && <p className="mt-2">Also in this area: {guide.municipalities.slice(6).map(t => t.name).join(", ")}.</p>}
            </details>
          </div>;
        })}
        <p className="text-xs leading-relaxed text-muted">Area groupings are proposed, not guaranteed delivery to every address. Town totals include their villages. <a href="https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Civil_Boundaries/MapServer/6" className="underline">Map & population source</a></p>
      </div>
    </div> : <div className="space-y-8">
      <div className="space-y-2">
        <Button variant="secondary" disabled={pending} onClick={() => { setStep(1); focusStep(); }}>Change areas</Button>
        <h2 ref={headingRef} tabIndex={-1} className="scroll-mt-24 text-2xl font-semibold outline-none">Choose one position in each area</h2>
        <p className="text-muted">Tap an available space for your ad.</p>
      </div>
      {chosen.length > 1 && <nav aria-label="Your selected areas" className="flex flex-wrap gap-2">
        {chosen.map(e => <button key={e.id} type="button" disabled={pending}
          aria-label={`Choose position for ${e.zoneName}`} aria-pressed={currentArea?.id === e.id}
          onClick={() => setActiveArea(e.id)}
          className={`min-h-11 rounded-xl border px-4 py-2 text-left text-sm ${currentArea?.id === e.id ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}>
          <span className="block font-medium">{e.zoneName}</span>
          <span className="text-muted">{hasPosition(e) ? `✓ ${e.slots.find(s => s.id === positions[e.id])?.label}` : "Choose a position"}</span>
        </button>)}
      </nav>}
      {currentArea && [currentArea].map(e => <section key={e.id} data-campaign-id={e.id} data-layout-key={e.layoutTemplate} aria-label={e.zoneName} className="space-y-3">
        <h3 className="text-xl font-semibold">{e.zoneName} <span className="text-base font-normal text-muted">· {formatPrice(e.unitPriceCents)}</span></h3>
        <div className="grid gap-4 lg:grid-cols-2">{(["front", "back"] as const).map(side => <PostcardSide layoutKey={e.layoutTemplate} key={side} side={side} dimensions={{ width: 9, height: 6 }} priceCents={e.unitPriceCents}
          views={e.slots.filter(s => s.side === side).map(slot => ({ slot, selected: positions[e.id] === slot.id, selectable: slot.available && !pending, note: slot.available ? "Available" : "Unavailable" }))}
          onSelect={slotId => { if (!pending) setPositions(previous => ({ ...previous, [e.id]: slotId })); }} />)}</div>
        <p aria-live="polite" className="text-sm text-muted">{hasPosition(e) ? `Selected: ${e.slots.find(s => s.id === positions[e.id])?.label}. You can change it before continuing.` : "Choose an available position above."}</p>
      </section>)}
    </div>}
    <details className="text-sm text-muted"><summary className="cursor-pointer">Mailing details</summary><p className="mt-2">{homes > 0 ? `Potential combined reach: approximately ${homes.toLocaleString()} households, provisional.` : "Household reach awaits confirmation."} Mailing dates and final delivery routes are confirmed before production.</p></details>
    {checkoutOpen && <p className="text-sm"><Link href="/book/cart" className="underline">Return to held areas</Link></p>}
    {!checkoutOpen && <p role="status">{CHECKOUT_CLOSED_MESSAGE}</p>}
    <section aria-label="Selection and next step" className="sticky bottom-0 z-20 rounded-2xl border border-line bg-surface p-4 shadow-lg sm:bottom-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0" aria-live="polite">
        <p className="font-semibold">{chosen.length ? `${chosen.length} ${chosen.length === 1 ? "area" : "areas"}` : "Choose an area to get started"} · <span>Due today: $0</span></p>
        {chosen.length > 0 && <p className="text-sm">{chosen.length === 1 ? "Total if this campaign fills" : chosen.length === 2 ? "Total if both campaigns fill" : "Total if all selected campaigns fill"}: {formatPrice(total)}</p>}
        <p className="mt-1 text-xs text-muted">{step === 2 && !positionsReady ? `${selectedCount} of ${chosen.length} positions chosen. ` : ""}Charged only after each campaign fills and is approved.</p>
      </div>
      {step === 1 ? <Button disabled={!chosen.length} onClick={() => { setStep(2); setMessage(""); focusStep(); }}>{checkoutOpen ? "Continue with selected areas" : "Preview selected areas"}</Button> :
        currentArea && hasPosition(currentArea) && nextArea ? <Button onClick={() => { setActiveArea(nextArea.id); focusStep(); }}>Next: {nextArea.zoneName}</Button> :
        <Button disabled={!checkoutOpen || !positionsReady || pending} onClick={() => {
          if (!checkoutOpen || !positionsReady || pending) return;
          start(async () => {
            setMessage("");
            try {
              const result = await holdAreas({ selections: chosen.map(e => ({ editionId: e.id, slotId: positions[e.id] })) });
              if (result.ok) router.push("/book/artwork");
              else { setMessage(result.message ?? "Please try again."); setPositions({}); router.refresh(); }
            } catch {
              setMessage("Connection interrupted. Your selection is still here. Check your held areas or try again.");
            }
          });
        }}>{!checkoutOpen ? "Reservations not open yet" : pending ? "Holding your positions…" : "Continue to artwork"}</Button>}
      {message && <p role="alert" className="mt-3">{message}</p>}
      </div>
    </section>
  </div>;
}
