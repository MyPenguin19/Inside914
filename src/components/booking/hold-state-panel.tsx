import Link from "next/link";
import type { ReactNode } from "react";

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-3">{children}</div>
    </section>
  );
}

// What to show when there's no usable hold behind the visitor's cookie.
export function HoldStatePanel({ state, editionId }: { state: "none" | "expired" | "error"; editionId?: string }) {
  if (state === "error") {
    return (
      <Panel title="We couldn't load your booking">
        <p className="text-muted">Please refresh the page in a moment.</p>
      </Panel>
    );
  }
  if (state === "expired") {
    return (
      <Panel title="Your hold has expired">
        <p className="text-muted">
          Your checkout window has ended, so your position may have been released. Go back to the postcard to check and hold it
          again. You&apos;ll need to upload your image again too.
        </p>
        <Link
          href={editionId ? `/editions/${editionId}` : "/areas"}
          className="mt-5 inline-block rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-accent"
        >
          Back to the postcard
        </Link>
      </Panel>
    );
  }
  return (
    <Panel title="You don't have a position on hold">
      <p className="text-muted">Choose an edition and a spot on the postcard first.</p>
      <Link href="/areas" className="mt-5 inline-block text-sm font-medium text-accent underline">
        See open editions
      </Link>
    </Panel>
  );
}
