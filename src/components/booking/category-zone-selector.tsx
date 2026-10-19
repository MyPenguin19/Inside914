"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { SelectField } from "@/components/ui/field";
import { REGIONS } from "@/lib/catalog/regions";
import type { EditionSummary } from "@/lib/catalog/queries";
import { formatPrice } from "@/lib/format";
import { holdAreas } from "@/app/book/cart/actions";
export type CategoryCatalog = { editions: EditionSummary[]; categories: { id: string; name: string }[]; availability: { edition_id: string | null; category_id: string | null; occupancy: string | null }[] };
export function CategoryZoneSelector({ editions, categories, availability }: CategoryCatalog) {
  const [category,setCategory] = useState("");
  const [selected,setSelected] = useState<string[]>([]);
  const [message,setMessage] = useState("");
  const [pending,start] = useTransition();
  const router = useRouter();
  const chosen = editions.filter(e=>selected.includes(e.id));
  const total = chosen.reduce((n,e)=>n+e.unitPriceCents,0);
  const homes = chosen.reduce((n,e)=>n+e.households,0);
  return <div className="space-y-6">
    <SelectField id="business-category" label="Choose your business category" value={category} onChange={e=>{setCategory(e.target.value);setSelected([]);setMessage("");}}>
      <option value="">Choose a category</option>
      {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
    </SelectField>
    <div className="grid gap-4 md:grid-cols-2">
      {REGIONS.map(region=>{
        const e=editions.find(e=>e.zoneSlug===region.slug);
        const occupancy=availability.find(a=>a.edition_id===e?.id && a.category_id===category)?.occupancy;
        const available=!!category && !!e && e.availableUnits>0 && occupancy==="available";
        const status=!category ? "Choose a category first" : !e || occupancy==="closed" ? "Not open" : e.availableUnits===0 ? "Full" : available ? "Available" : occupancy==="held" ? "Temporarily held" : "Unavailable";
        return <Card key={region.slug}><label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-accent" disabled={!available || pending} checked={!!e && selected.includes(e.id)} onChange={event=>{if(e)setSelected(event.target.checked?[...selected,e.id]:selected.filter(id=>id!==e.id));}} />
          <span><span className="block text-lg font-semibold">{region.name}</span><span className="block text-sm text-muted">{status}{e ? ` · ${formatPrice(e.unitPriceCents)} per square ad` : ""}</span></span>
        </label></Card>;
      })}
    </div>
    <Card><h2 className="text-xl font-semibold">Selected: {chosen.length} zones</h2>
      <p className="mt-2 text-muted">{homes>0 ? `Potential combined reach: approximately ${homes.toLocaleString()} households, provisional.` : "Household reach awaits confirmation."}</p>
      <p className="mt-3 font-semibold">Maximum authorized total: {formatPrice(total)}</p><p>Due today: $0</p>
      <p className="my-3 text-sm text-muted">One square ad is used across your selected zones. Each zone fills independently and must reach 10 advertisers and be approved for mailing before its $399 charge.</p>
      <Button disabled={!selected.length || pending} onClick={()=>start(async()=>{const result=await holdAreas({categoryId:category,editionIds:selected}); if(result.ok)router.push("/book/cart");else {setMessage(result.message??"Please try again.");setSelected([]);router.refresh();}})}>{pending?"Holding zones…":"Continue with selected zones"}</Button>
      {message && <p role="alert" className="mt-3">{message}</p>}
      <p className="mt-3"><Link href="/book/cart" className="underline">Return to held zones</Link></p>
    </Card>
  </div>;
}
