import Link from "next/link";

// GET-form search plus filter chips; state lives in the URL so results are shareable and server-rendered.
export function Filters({
  base,
  filter,
  filters,
  q,
  searchLabel = "Search business, contact or email",
}: {
  base: string;
  filter: string;
  filters: [string, string][];
  q?: string;
  searchLabel?: string;
}) {
  const href = (f: string) => {
    const p = new URLSearchParams();
    if (f !== "all") p.set("filter", f);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <nav aria-label="Filter" className="flex flex-wrap gap-2 text-sm">
        {filters.map(([value, label]) => (
          <Link
            key={value}
            href={href(value)}
            aria-current={filter === value ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 ${filter === value ? "border-foreground bg-foreground text-background" : "border-line hover:border-foreground"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form action={base} className="flex gap-2" role="search">
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        <label htmlFor="q" className="sr-only">
          {searchLabel}
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder={searchLabel}
          className="w-full min-w-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm lg:w-72"
        />
        <button type="submit" className="rounded-full border border-line px-4 py-2 text-sm hover:border-foreground">
          Search
        </button>
      </form>
    </div>
  );
}

export const pageParam = (raw: unknown) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 10_000 ? n : 1;
};
