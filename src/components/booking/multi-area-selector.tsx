"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PostcardBooking } from "./postcard-booking";
import type { EditionCatalog } from "@/lib/catalog/queries";
import { priceFor, type SizeMode } from "@/lib/booking/selection";
import { formatPrice } from "@/lib/format";
import { buttonClass } from "@/components/ui/button";
import { holdAreas } from "@/app/book/cart/actions";
type Choice = { editionId: string; slotIds: string[]; mode: SizeMode };
export function MultiAreaSelector({
  catalogs,
}: {
  catalogs: EditionCatalog[];
}) {
  const [choices, setChoices] = useState<Choice[]>([]);
  const [current, setCurrent] = useState(catalogs[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const catalog = catalogs.find((c) => c.id === current);
  const total = choices.reduce(
    (n, c) =>
      n +
      (priceFor(
        c.mode,
        catalogs.find((e) => e.id === c.editionId)!,
      ) ?? 0),
    0,
  );
  return (
    <div className="space-y-6">
      <p className="text-muted">
        Choose one campaign per area, up to four areas. Positions are held
        together when you continue. Household counts are provisional and are not
        confirmed delivery quantities.
      </p>
      <Link href="/book/cart" className="underline">
        Return to held areas
      </Link>
      <label className="block">
        Area and campaign
        <select
          className="mt-2 block w-full rounded-xl border border-line bg-surface p-3"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        >
          {catalogs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.zoneName} · {c.issueMonth}
            </option>
          ))}
        </select>
      </label>
      {catalog && (
        <PostcardBooking
          key={catalog.id}
          catalog={catalog}
          nextHref={null}
          continueLabel="Add this area to selection"
          holdSelection={async (input) => {
            const next = choices.filter(
              (c) =>
                catalogs.find((e) => e.id === c.editionId)?.zoneSlug !==
                catalog.zoneSlug,
            );
            if (next.length >= 4)
              return { ok: false, reason: "invalid_selection" };
            setChoices([...next, { ...input, mode: input.mode ?? "standard" }]);
            setMessage(
              `${catalog.zoneName} added. Choose another area or hold all selected areas below.`,
            );
            return { ok: true };
          }}
        />
      )}
      <section
        className="rounded-2xl border border-line bg-surface p-5"
        aria-label="Selected areas"
      >
        <h2 className="text-xl font-semibold">
          Selected areas ({choices.length}/4)
        </h2>
        {choices.map((c) => {
          const e = catalogs.find((e) => e.id === c.editionId)!;
          return (
            <div
              key={c.editionId}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3"
            >
              <span>
                {e.zoneName} · {formatPrice(priceFor(c.mode, e) ?? 0)}
                <br />
                <span className="text-sm text-muted">
                  {e.households > 0
                    ? `${e.households.toLocaleString()} households, provisional`
                    : "Household count awaiting confirmation"}
                </span>
              </span>
              <button
                className="underline"
                onClick={() =>
                  setChoices(choices.filter((x) => x.editionId !== c.editionId))
                }
              >
                Remove {e.zoneName}
              </button>
            </div>
          );
        })}
        <p className="my-4 font-semibold">Total: {formatPrice(total)}</p>
        <button
          className={buttonClass()}
          disabled={!choices.length || pending}
          onClick={() =>
            start(async () => {
              const result = await holdAreas(choices);
              if (result.ok) router.push("/book/cart");
              else setMessage(result.message ?? "Could not hold areas.");
            })
          }
        >
          {pending ? "Holding areas…" : "Hold selected areas (15 min)"}
        </button>
        {message && (
          <p className="mt-3" role="status">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
