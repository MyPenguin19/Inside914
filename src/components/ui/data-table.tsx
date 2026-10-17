import type { ReactNode } from "react";

// Accessible table for admin views. Phones get one card per row instead of sideways scrolling.
export function DataTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: ReactNode[][] }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface sm:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
              {columns.map((c) => (
                <th key={c} scope="col" className="px-4 py-3 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-3 align-middle">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul aria-label={caption} className="grid gap-3 sm:hidden">
        {rows.map((row, i) => (
          <li key={i} className="rounded-2xl border border-line bg-surface p-4">
            <div className="text-base">{row[0]}</div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {row.slice(1).map((cell, j) => (
                <div key={j}>
                  <dt className="text-xs text-muted">{columns[j + 1]}</dt>
                  <dd className="mt-0.5">{cell}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
