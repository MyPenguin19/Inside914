"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { HoldSelectionResult } from "@/app/(public)/actions/booking";
import { PostcardSide, type SlotView } from "@/components/postcard/postcard-side";
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
};

const SIDES: Side[] = ["front", "back"];

export function PostcardBooking({ catalog, holdSelection }: Props) {
  const router = useRouter();
  const [slots, setSlots] = useState<CatalogSlot[]>(catalog.slots);
  const [pairs, setPairs] = useState<SlotPair[]>(catalog.pairs);
  const [mode, setMode] = useState<SizeMode>("standard");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, startTransition] = useTransition();

  const pricing = { unitPriceCents: catalog.unitPriceCents, doublePriceCents: catalog.doublePriceCents };
  const doubleOffered = isDoubleOffered(pricing, pairs);
  const doubleAvailable = doubleOffered && pairs.some((p) => p.available);
  const price = priceFor(mode, pricing);
  const selectedSlots = slots.filter((s) => selected.includes(s.id));

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
        router.push("/book/hold");
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
            ? "Reserved"
            : selectable
              ? "Open"
              : "Single only";
        return { slot, selected: isSelected, selectable, note };
      });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-labelledby="postcard-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="postcard-title" className="text-lg font-semibold">
            Choose your position
          </h2>
          <Legend />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:gap-8">
          {SIDES.map((side) => (
            <PostcardSide key={side} side={side} views={viewsFor(side)} priceCents={price} onSelect={select} />
          ))}
        </div>
        <p className="mt-4 rounded-lg border border-dashed border-line px-4 py-3 text-xs text-muted">
          <strong className="font-medium text-foreground">Provisional layout.</strong> Positions are shown to scale on a
          6.5&Prime; × 12&Prime; card for planning. Final position sizes will be confirmed once our printer and postal
          specifications are approved.
        </p>
      </section>

      <aside aria-labelledby="summary-title" className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h2 id="summary-title" className="text-lg font-semibold">
            Your ad
          </h2>

          <fieldset className="mt-4">
            <legend className="text-sm font-medium">Ad size</legend>
            <div className="mt-2 grid gap-2">
              <SizeOption
                label="Standard"
                detail="One position"
                price={formatPrice(catalog.unitPriceCents)}
                checked={mode === "standard"}
                onChange={() => changeMode("standard")}
              />
              {doubleOffered && catalog.doublePriceCents !== null && (
                <SizeOption
                  label="Double"
                  detail={doubleAvailable ? "Two side-by-side positions" : "No side-by-side pairs left"}
                  price={formatPrice(catalog.doublePriceCents)}
                  checked={mode === "double"}
                  disabled={!doubleAvailable}
                  onChange={() => changeMode("double")}
                />
              )}
            </div>
          </fieldset>

          <div className="mt-5 border-t border-line pt-4" aria-live="polite">
            <p className="text-sm text-muted">Selected position</p>
            <p className="mt-1 font-medium">
              {selectedSlots.length
                ? `${selectedSlots[0].side === "front" ? "Front" : "Back"} · ${selectedSlots.map((s) => s.label).join(" + ")}`
                : mode === "double"
                  ? "Pick a position; we'll pair it with its neighbor."
                  : "Pick an open position on the postcard."}
            </p>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-sm text-muted">Price</span>
              <span data-testid="total-price" className="text-2xl font-semibold">{price !== null ? formatPrice(price) : "—"}</span>
            </div>
            <p className="mt-1 text-xs text-muted">Nothing is charged today. Payment comes after your artwork.</p>
          </div>

          {message && (
            <p
              role={message.tone === "error" ? "alert" : "status"}
              className={`mt-4 rounded-lg px-3 py-2 text-sm ${
                message.tone === "error" ? "bg-[#fbeceb] text-danger" : "bg-accent-soft text-accent"
              }`}
            >
              {message.text}
            </p>
          )}

          <button
            type="button"
            onClick={hold}
            disabled={!selected.length || pending}
            className="mt-5 w-full rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
          >
            {pending ? "Checking availability…" : "Hold this position for 15 minutes"}
          </button>
          <p className="mt-2 text-center text-xs text-muted">Next: upload your artwork.</p>
        </div>
      </aside>
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
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
        props.checked ? "border-accent bg-accent-soft" : "border-line"
      } ${props.disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <span className="flex items-center gap-3">
        <input
          type="radio"
          name="ad-size"
          checked={props.checked}
          disabled={props.disabled}
          onChange={props.onChange}
          className="accent-[var(--accent)]"
        />
        <span>
          <span className="block text-sm font-medium">{props.label}</span>
          <span className="block text-xs text-muted">{props.detail}</span>
        </span>
      </span>
      <span className="text-sm font-semibold">{props.price}</span>
    </label>
  );
}

function Legend() {
  return (
    <ul className="flex gap-4 text-xs text-muted" aria-label="Legend">
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 w-3 rounded-sm border border-line bg-background" /> Open
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 w-3 rounded-sm bg-accent" /> Selected
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 w-3 rounded-sm border border-dashed border-line bg-[#efece5]" />{" "}
        Reserved
      </li>
    </ul>
  );
}
