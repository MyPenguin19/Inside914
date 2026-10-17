"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { HoldSelectionResult } from "@/app/(public)/actions/booking";
import { PostcardSide, type PostcardZone, type SlotView } from "@/components/postcard/postcard-side";
import { buttonClass } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/primitives";
import {
  applyAvailability,
  isDoubleOffered,
  isSelectable,
  priceFor,
  selectionForSlot,
  type CatalogSlot,
  type Side,
  type SizeMode,
  type SlotPair,
} from "@/lib/booking/selection";
import type { EditionCatalog } from "@/lib/catalog/queries";
import { formatPrice } from "@/lib/format";

type Props = {
  catalog: EditionCatalog;
  holdSelection: (input: { editionId: string; slotIds: string[] }) => Promise<HoldSelectionResult>;
  nextHref?: string; // where to go once the hold is placed
  continueLabel?: string;
  initialSelected?: string[]; // restore a previous choice (e.g. after going back)
  zones?: PostcardZone[]; // printed non-ad areas (masthead, mailing panel), if the layout has them
};

type Message = { tone: "error" | "info"; text: string };

const FAILURE_TEXT: Record<Exclude<HoldSelectionResult, { ok: true }>["reason"], string> = {
  slot_unavailable:
    "Another business just reserved that position. We've refreshed the postcard, so please choose another spot.",
  edition_closed: "This edition is no longer taking bookings.",
  invalid_selection: "Those two positions can't be combined into a double-size ad. Please choose again.",
  slot_not_found: "That position has changed since the page loaded. Please refresh the page.",
  invalid_input: "That selection wasn't valid. Please choose a position again.",
  error: "We couldn't hold your position right now. Nothing was reserved; please try again in a moment.",
  rate_limited: "That's a lot of attempts in a short time. Please wait a few minutes, then try again.",
};

const SIDES: Side[] = ["front", "back"];

export function PostcardBooking({
  catalog,
  holdSelection,
  nextHref = "/book/hold",
  continueLabel = "Hold this position (15 min)",
  initialSelected = [],
  zones,
}: Props) {
  const router = useRouter();
  const [slots, setSlots] = useState<CatalogSlot[]>(catalog.slots);
  const [pairs, setPairs] = useState<SlotPair[]>(catalog.pairs);
  const [mode, setMode] = useState<SizeMode>(initialSelected.length === 2 ? "double" : "standard");
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, startTransition] = useTransition();
  const [visibleSide, setVisibleSide] = useState<Side>(
    catalog.slots.find((s) => s.id === initialSelected[0])?.side ?? "front",
  );

  const pricing = { unitPriceCents: catalog.unitPriceCents, doublePriceCents: catalog.doublePriceCents };
  const doubleOffered = isDoubleOffered(pricing, pairs);
  const doubleAvailable = doubleOffered && pairs.some((p) => p.available);
  const price = priceFor(mode, pricing);
  const selectedSlots = slots.filter((s) => selected.includes(s.id));
  const selectionText = selectedSlots.length
    ? `${selectedSlots[0].side === "front" ? "Front" : "Back"} · ${selectedSlots.map((s) => s.label).join(" + ")}`
    : null;

  function changeMode(next: SizeMode) {
    setMode(next);
    setSelected([]);
    setMessage(null);
  }

  function select(slotId: string) {
    if (selected.includes(slotId)) {
      setSelected([]);
      return;
    }
    const next = selectionForSlot(slotId, mode, slots, pairs);
    if (next) {
      setSelected(next);
      setMessage(null);
    }
  }

  function hold() {
    if (!selected.length) return;
    setMessage(null);
    startTransition(async () => {
      const result = await holdSelection({ editionId: catalog.id, slotIds: selected });
      if (result.ok) {
        router.push(nextHref);
        return;
      }
      if (result.availability) {
        setSlots((current) => applyAvailability(current, result.availability!));
        setPairs(result.availability.pairs);
        setSelected([]);
      }
      setMessage({ tone: "error", text: FAILURE_TEXT[result.reason] });
    });
  }

  function viewsFor(side: Side): SlotView[] {
    return slots
      .filter((s) => s.side === side)
      .map((slot) => {
        const isSelected = selected.includes(slot.id);
        const selectable = isSelectable(slot.id, mode, slots, pairs);
        const note = isSelected
          ? "Selected"
          : !slot.available
            ? slot.occupancy === "held"
              ? "On hold"
              : slot.occupancy === "closed"
                ? "Closed"
                : "Reserved"
            : selectable
              ? "Available"
              : "Standard only";
        return { slot, selected: isSelected, selectable, note };
      });
  }

  const continueButton = (extra: string) => (
    <button type="button" onClick={hold} disabled={!selected.length || pending} className={buttonClass("primary", "lg", extra)}>
      {pending ? "Checking availability…" : continueLabel}
    </button>
  );

  return (
    // Phones: size, then the card, then the summary (the aside "dissolves" via display:contents so its
    // parts can be ordered around the card). Wide screens: cards left, size + summary sticky right.
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
      <section aria-labelledby="postcard-title" className="order-2 min-w-0 lg:order-none">
        <h2 id="postcard-title" className="sr-only">
          Choose your position
        </h2>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium">2. Tap an available space</p>
            {/* Narrow screens show one side at a time; wide screens show both. */}
            <div role="group" aria-label="Postcard side" className="mt-2 inline-flex rounded-full border border-line bg-surface p-1 lg:hidden">
              {SIDES.map((side) => {
                const count = selectedSlots.filter((s) => s.side === side).length;
                return (
                  <button
                    key={side}
                    type="button"
                    aria-pressed={visibleSide === side}
                    onClick={() => setVisibleSide(side)}
                    className={`min-h-11 rounded-full px-5 text-sm font-medium transition-colors ${
                      visibleSide === side ? "bg-foreground text-background" : "text-muted hover:text-foreground"
                    }`}
                  >
                    {side === "front" ? "Front" : "Back"}
                    {count > 0 && <span className="ml-1.5 text-xs opacity-80">· selected</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <Legend />
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          {SIDES.map((side) => (
            // Capped so a whole card fits on screen; the 6.5 x 12 proportions never change.
            <div
              key={side}
              className={`mx-auto w-full max-w-[400px] lg:max-w-[calc((100svh-8rem)*6.5/12)] ${visibleSide === side ? "" : "hidden lg:block"}`}
            >
              <p className="mb-2 hidden text-sm font-medium text-muted lg:block">{side === "front" ? "Front" : "Back"}</p>
              <PostcardSide side={side} views={viewsFor(side)} priceCents={price} onSelect={select} zones={zones} caption={false} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-muted">
          Actual size 6.5&Prime; × 12&Prime;. <strong className="font-medium text-foreground">Provisional layout:</strong> final space
          sizes are confirmed with our printer.
        </p>
      </section>

      <aside aria-labelledby="summary-title" className="contents lg:sticky lg:top-20 lg:block lg:self-start">
        <fieldset className="order-1 lg:order-none">
          <legend className="text-sm font-medium">1. Choose a size</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-md lg:max-w-none">
            <SizeOption
              label="Standard"
              detail="One space"
              price={formatPrice(catalog.unitPriceCents)}
              checked={mode === "standard"}
              onChange={() => changeMode("standard")}
              shape="standard"
            />
            {doubleOffered && catalog.doublePriceCents !== null && (
              <SizeOption
                label="Double"
                detail={doubleAvailable ? "Two spaces, side by side" : "None left"}
                price={formatPrice(catalog.doublePriceCents)}
                checked={mode === "double"}
                disabled={!doubleAvailable}
                onChange={() => changeMode("double")}
                shape="double"
              />
            )}
          </div>
        </fieldset>

        <Card className="order-3 lg:mt-5 lg:order-none">
          <h2 id="summary-title" className="text-lg font-semibold">
            Your ad
          </h2>
          <dl className="mt-3 grid gap-2.5 text-sm" aria-live="polite">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Size</dt>
              <dd className="font-medium">{mode === "double" ? "Double" : "Standard"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Position</dt>
              <dd className="text-right font-medium">
                {selectionText ?? (mode === "double" ? "Pick a space; we'll pair it with its neighbor" : "Not chosen yet")}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
            <span className="text-sm text-muted">Price</span>
            <span data-testid="total-price" className="font-display text-3xl font-medium">
              {price !== null ? formatPrice(price) : "—"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">$0 today. Charged only if the postcard fills and is approved.</p>

          {message && (
            <div className="mt-4">
              <Notice tone={message.tone === "error" ? "danger" : "success"} role={message.tone === "error" ? "alert" : "status"}>
                {message.text}
              </Notice>
            </div>
          )}

          {/* Visibility lives on a wrapper: the button's own display class would override "hidden". */}
          <div className="mt-5 hidden lg:block">{continueButton("w-full")}</div>
          <p className="mt-2 hidden text-center text-xs text-muted lg:block">Next: upload your artwork.</p>
        </Card>
      </aside>

      {/* Phones: choice, price and next step stay in reach. Sticky inside this grid (not fixed to the
          window), so it settles after the summary and never covers the footer. */}
      <div className="sticky bottom-3 z-30 order-4 self-end rounded-2xl border border-line bg-surface/95 p-3 pl-4 shadow-[0_12px_32px_-12px_rgba(28,27,25,0.4)] backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{selectionText ?? "Tap an available space"}</p>
            <p className="truncate text-xs text-muted">
              {mode === "double" ? "Double" : "Standard"} · {price !== null ? formatPrice(price) : "—"} · $0 today
            </p>
          </div>
          {continueButton("shrink-0 !px-5")}
        </div>
      </div>
    </div>
  );
}

function SizeOption(props: {
  label: string;
  detail: string;
  price: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  shape: "standard" | "double";
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
        props.checked ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong"
      } ${props.disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input type="radio" name="ad-size" checked={props.checked} disabled={props.disabled} onChange={props.onChange} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
      <span aria-hidden="true" className="grid h-9 w-7 shrink-0 grid-cols-2 grid-rows-4 gap-px rounded-[3px] border border-line-strong bg-paper p-px">
        <span className={`row-start-2 rounded-[1px] bg-accent ${props.shape === "double" ? "col-span-2" : ""}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{props.label}</span>
        <span className="block text-xs leading-snug text-muted">
          <span className="font-semibold text-foreground">{props.price}</span> · {props.detail}
        </span>
      </span>
    </label>
  );
}

function Legend() {
  return (
    <ul className="flex gap-4 text-xs text-muted" aria-label="Legend">
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 w-3 rounded-sm border border-dashed border-line-strong bg-surface" /> Available
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 w-3 rounded-sm bg-accent" /> Yours
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 w-3 rounded-sm bg-reserved" /> Reserved
      </li>
    </ul>
  );
}
