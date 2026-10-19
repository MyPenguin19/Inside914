"use client";

import { useActionState } from "react";
import { saveZone } from "@/app/admin/admin-actions";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/primitives";

export function ZoneForm({ zone, prefix }: { zone: { id?: string; name: string; slug: string; household_count: number }; prefix: string }) {
  const [state, action, pending] = useActionState(saveZone, {});
  const v = (key: "name" | "slug" | "household_count") => state.values?.[key] ?? String(zone[key]);
  return <form action={action} className="flex min-w-0 flex-col gap-4">
    <input type="hidden" name="id" value={zone.id ?? ""} />
    {state.message && <Notice tone={state.ok ? "success" : "danger"} role="status">{state.message}</Notice>}
    <TextField id={`${prefix}-name`} name="name" label="Zone name" required maxLength={120} defaultValue={v("name")} />
    <TextField id={`${prefix}-slug`} name="slug" label="Slug" required maxLength={120} defaultValue={v("slug")} hint="Used in public links. Locked once a campaign uses this zone." />
    <TextField id={`${prefix}-households`} name="household_count" label="Target households (provisional)" type="number" min={0} max={1000000} required defaultValue={v("household_count")} hint="An estimate, not a confirmed delivery quantity. Use 0 while the estimate is unset. No postal routes or ZIP codes are implied." />
    <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : zone.id ? "Save zone" : "Create zone"}</Button></div>
  </form>;
}
