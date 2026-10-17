import Link from "next/link";
import type { ReactNode } from "react";
import { Card, StatusBadge, type Tone } from "@/components/ui/primitives";

// Small building blocks shared by the admin pages.

export function PageHeader({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {children}
    </header>
  );
}

export function Stat({ label, value, note, href }: { label: string; value: string; note?: string; href?: string }) {
  const body = (
    <Card className={`h-full p-4 sm:p-5 ${href ? "transition-colors hover:border-line-strong" : ""}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-medium sm:text-3xl">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Badge({ label }: { label: { text: string; tone: Tone } }) {
  return <StatusBadge tone={label.tone}>{label.text}</StatusBadge>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function LoadError({ what }: { what: string }) {
  return (
    <div role="alert" className="rounded-2xl bg-danger-soft px-5 py-4 text-sm text-danger">
      We couldn&apos;t load {what} right now. Please refresh in a moment.
    </div>
  );
}

export function PanelSkeleton() {
  return <div className="h-80 animate-pulse rounded-2xl border border-line bg-surface" aria-busy="true" aria-label="Loading" />;
}

export function Pagination({ page, total, pageSize, href }: { page: number; total: number; pageSize: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
      <span className="text-muted">
        Page {page} of {pages} · {total} total
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link href={href(page - 1)} className="rounded-full border border-line px-4 py-2 hover:border-foreground">
            Previous
          </Link>
        )}
        {page < pages && (
          <Link href={href(page + 1)} className="rounded-full border border-line px-4 py-2 hover:border-foreground">
            Next
          </Link>
        )}
      </span>
    </nav>
  );
}

export function DetailList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="mt-0.5 font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
