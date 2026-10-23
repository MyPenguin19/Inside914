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
import { WestchesterMap } from "./westchester-map";
import { AREA_GUIDE } from "./westchester-map-data";
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
  const mapAreas = REGIONS.map(region => {
    const edition = editions.find(e => e.zoneSlug === region.slug);
    return { slug: region.slug, selected: !!edition && selected.includes(edition.id),
      available: !!edition && edition.bookable && edition.availableUnits > 0 && !pending,
      status: !edition || !edition.bookable ? "Not open" : edition.availableUnits === 0 ? "Full" : "Available" };
  });
  const toggleArea = (slug: (typeof REGIONS)[number]["slug"]) => {
    const area = mapAreas.find(a => a.slug === slug);
    const edition = editions.find(e => e.zoneSlug === slug);
    if (!area?.available || !edition) return;
    setSelected(previous => previous.includes(edition.id) ? previous.filter(id => id !== edition.id) : [...previous, edition.id]);
  };
  return <div className="space-y-6">
    <BookingSteps current={step} />
    {step === 1 ? <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <WestchesterMap areas={mapAreas} onToggle={toggleArea} />
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Pick one or more areas</h2>
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
              <p className="mt-2 text-xs">Six largest municipalities · 2020 Census population</p>
              <ol className="mt-2 space-y-1">{guide.municipalities.slice(0, 6).map((town, i) => <li key={town.id} className="flex justify-between gap-3"><span>{i + 1}. {town.name}</span><span className="tabular-nums">{town.population.toLocaleString("en-US")}</span></li>)}</ol>
              {guide.municipalities.length > 6 && <p className="mt-2">Also in this area: {guide.municipalities.slice(6).map(t => t.name).join(", ")}.</p>}
            </details>
          </div>;
        })}
        <p className="text-xs leading-relaxed text-muted">Area groupings are proposed, not guaranteed delivery to every address. Town totals include their villages. <a href="https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Civil_Boundaries/MapServer/6" className="underline">Map & population source</a></p>
      </div>
    </div> : <div className="space-y-8">
      <h2 className="text-2xl font-semibold">Choose one position in each area</h2>
      <p className="text-muted">Pick a position on the front or back. Next, add your image.</p>
      {chosen.map(e => <section key={e.id} data-campaign-id={e.id} data-layout-key={e.layoutTemplate} aria-label={e.zoneName} className="space-y-3">
        <h3 className="text-xl font-semibold">{e.zoneName}</h3>
        <div className="grid gap-4 lg:grid-cols-2">{(["front", "back"] as const).map(side => <PostcardSide layoutKey={e.layoutTemplate} key={side} side={side} dimensions={{ width: 9, height: 6 }} priceCents={e.unitPriceCents}
          views={e.slots.filter(s => s.side === side).map(slot => ({ slot, selected: positions[e.id] === slot.id, selectable: slot.available && !pending, note: slot.available ? "Available" : "Unavailable" }))}
          onSelect={slotId => { if (!pending) setPositions(previous => ({ ...previous, [e.id]: slotId })); }} />)}</div>
        <p className="text-sm text-muted">Selected: {e.slots.find(s => s.id === positions[e.id])?.label ?? "Choose a position"}. Only outlined positions can be booked.</p>
      </section>)}
      <Button variant="secondary" disabled={pending} onClick={() => setStep(1)}>Change areas</Button>
    </div>}
    <Card><h2 aria-live="polite" className="text-xl font-semibold">Selected: {chosen.length} {chosen.length === 1 ? "area" : "areas"}</h2>
      <details className="mt-2 text-sm text-muted"><summary className="cursor-pointer">Mailing details</summary><p className="mt-2">{homes > 0 ? `Potential combined reach: approximately ${homes.toLocaleString()} households, provisional.` : "Household reach awaits confirmation."} Mailing dates and final delivery routes are confirmed before production.</p></details>
      <p className="mt-3 font-semibold">{chosen.length === 1 ? "Total if this campaign fills" : chosen.length === 2 ? "Total if both campaigns fill" : "Total if all selected campaigns fill"}: {formatPrice(total)}</p><p>Due today: $0</p>
      <p className="my-3 text-sm text-muted">You pay each area’s listed price only after its postcard fills and is approved.</p>
      {step === 1 ? <Button disabled={!chosen.length} onClick={() => { setStep(2); setMessage(""); }}>Continue with selected areas</Button> :
        <Button disabled={!chosen.length || chosen.some(e => !positions[e.id]) || pending} onClick={() => start(async () => {
          const result = await holdAreas({ selections: chosen.map(e => ({ editionId: e.id, slotId: positions[e.id] })) });
          if (result.ok) router.push("/book/cart");
          else { setMessage(result.message ?? "Please try again."); setPositions({}); router.refresh(); }
        })}>{pending ? "Holding your positions…" : "Continue to artwork"}</Button>}
      {message && <p role="alert" className="mt-3">{message}</p>}
      <p className="mt-3"><Link href="/book/cart" className="underline">Return to held areas</Link></p>
    </Card>
  </div>;
}
