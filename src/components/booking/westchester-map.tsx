"use client";

import { useId } from "react";
import { REGIONS } from "@/lib/catalog/regions";
import { AREA_GUIDE, WESTCHESTER_OUTLINE } from "./westchester-map-data";

const REGION_FILL = {
  "central-westchester": "fill-info-soft",
  "southern-westchester": "fill-warning-soft",
  "northern-westchester": "fill-accent-soft",
  "eastern-westchester": "fill-line",
} as const;

type RegionSlug = (typeof REGIONS)[number]["slug"];
export type MapArea = { slug: RegionSlug; selected: boolean; available: boolean; status: string };

// Presentation only: both this map and the checkboxes call the existing selection handler.
export function WestchesterMap({ areas, onToggle }: { areas: MapArea[]; onToggle: (slug: RegionSlug) => void }) {
  const id = useId();
  return <figure className="rounded-2xl border border-line bg-background-soft p-4 sm:p-5">
    <figcaption className="text-center">
      <p className="font-display text-2xl">Westchester, NY</p>
      <p className="mt-1 text-sm text-muted">Tap an area to select it.</p>
    </figcaption>
    <svg viewBox="0 0 380 430" className="mx-auto w-full max-w-[380px]" role="group" aria-label="Choose areas on the Westchester map" aria-describedby={`${id}-note`}>
      <defs><clipPath id={`${id}-county`}><path d={WESTCHESTER_OUTLINE} /></clipPath></defs>
      <text x="27" y="42" className="fill-muted text-[12px]" textAnchor="middle">N ↑</text>
      <text x="22" y="245" transform="rotate(-90 22 245)" className="fill-muted text-[11px]" textAnchor="middle">HUDSON RIVER</text>
      <text x="320" y="185" transform="rotate(58 320 185)" className="fill-muted text-[11px]" textAnchor="middle">CONNECTICUT</text>
      <g aria-hidden="true">{areas.map(area => <path key={area.slug} d={AREA_GUIDE[area.slug].path}
        clipPath={`url(#${id}-county)`} strokeWidth="1.5"
        onClick={() => { if (area.available) onToggle(area.slug); }}
        className={`${area.available ? "cursor-pointer" : "cursor-not-allowed"} ${area.selected ? "fill-accent stroke-surface" : `${REGION_FILL[area.slug]} stroke-surface ${area.available ? "hover:stroke-accent" : "opacity-60"}`}`} />)}</g>
      {areas.map(area => {
        const guide = AREA_GUIDE[area.slug];
        const name = REGIONS.find(r => r.slug === area.slug)!.name;
        return <g key={area.slug} role="button" tabIndex={0} aria-label={`${name} on map — ${area.status}`}
          aria-pressed={area.selected} aria-disabled={!area.available}
          className={`group ${area.available ? "cursor-pointer" : "cursor-not-allowed"}`}
          onClick={() => { if (area.available) onToggle(area.slug); }}
          onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (area.available) onToggle(area.slug); } }}>
          <g transform={`translate(${guide.label[0]} ${guide.label[1]})`}>
            <rect x="-49" y="-15" width="98" height="42" rx="10" className={area.selected ? "fill-accent stroke-surface" : "fill-surface stroke-line"} />
            <text textAnchor="middle" className={`text-[13px] font-semibold ${area.selected ? "fill-surface" : "fill-foreground"}`}>{name.split(" ")[0]}{area.selected ? " ✓" : ""}</text>
            <text textAnchor="middle" y="16" className={`text-[10px] ${area.selected ? "fill-surface" : "fill-muted"}`}>{area.selected ? "Selected" : area.status}</text>
          </g>
        </g>;
      })}
      <text x="105" y="423" className="fill-muted text-[11px]" textAnchor="middle">NEW YORK CITY</text>
    </svg>
    <p id={`${id}-note`} className="text-center text-xs leading-relaxed text-muted">Proposed area guide. Exact mailing routes are confirmed before mailing.</p>
  </figure>;
}
