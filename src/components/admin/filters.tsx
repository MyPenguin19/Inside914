import Link from "next/link";

// GET-form search plus filter chips; state lives in the URL so results are shareable and server-rendered.
export function Filters({
  base,
  filter,
  filters,
  q,
  campaign,
  campaigns,
  searchLabel = "Search business, contact or email",
}: {
  base: string;
  filter: string;
  filters: [string, string][];
  q?: string;
  campaign?: string;
  campaigns?: { id: string; label: string }[];
  searchLabel?: string;
}) {
  const href = (f: string, query = q) => {
    const p = new URLSearchParams();
    p.set("filter", f);
    if (query) p.set("q", query);
    if (campaign) p.set("campaign", campaign);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
      <nav aria-label="Filter" className="flex flex-wrap gap-2 text-sm">
        {filters.map(([value, label]) => (
          <Link
            key={value}
            href={href(value)}
            aria-current={filter === value ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border px-3 py-1.5 ${filter === value ? "border-foreground bg-foreground text-background" : "border-line hover:border-foreground"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form key={`${filter}:${campaign}:${q}`} action={base} className="flex flex-wrap items-end gap-3" role="search">
        <input type="hidden" name="filter" value={filter} />
        {campaigns && <div className="w-full min-w-0 sm:w-64"><label htmlFor="campaign-filter" className="mb-1 block text-sm text-muted">Campaign</label>
          <select id="campaign-filter" name="campaign" defaultValue={campaign ?? ""} className="min-h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
            <option value="">All campaigns</option>{campaigns.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select></div>}
        <div className="min-w-0 flex-1 basis-48">
        <label htmlFor="q" className="sr-only">
          {searchLabel}
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder={searchLabel}
          className="min-h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm"
        />
        </div>
        <button type="submit" className="min-h-11 rounded-full border border-line px-4 py-2 text-sm hover:border-foreground">
          Show results
        </button>
        {q && <Link href={href(filter, "")} className="px-2 py-3 text-sm underline">Clear search</Link>}
      </form>
    </div>
  );
}

export const pageParam = (raw: unknown) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 10_000 ? n : 1;
};
