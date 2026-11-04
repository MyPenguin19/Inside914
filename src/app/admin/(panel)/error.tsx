"use client";

import { Button, ButtonLink } from "@/components/ui/button";

export default function AdminError({ reset }: { reset: () => void }) {
  return <section role="alert" className="rounded-2xl border border-line bg-surface p-6">
    <h1 className="text-xl font-semibold">This page couldn’t finish loading</h1>
    <p className="mt-2 text-sm text-muted">Try loading it again. If you were saving a change, check its status before repeating it.</p>
    <div className="mt-4 flex flex-wrap gap-3"><Button onClick={reset}>Try again</Button><ButtonLink href="/admin" variant="secondary">Back to Home</ButtonLink></div>
  </section>;
}
