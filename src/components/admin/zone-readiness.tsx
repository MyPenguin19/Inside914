import { Card, StatusBadge } from "@/components/ui/primitives";
import type { zoneReadiness } from "@/lib/admin/zone-readiness";

export function ZoneReadiness({ readiness }: { readiness: ReturnType<typeof zoneReadiness> }) {
  return <Card>
    <h2 className="text-lg font-semibold">Zone readiness</h2>
    <ul className="mt-3 grid gap-2 text-sm">{readiness.checks.filter(check => !["Printer layout approved", "House artwork and final proof approved"].includes(check.label)).map(check => <li key={check.label} className="flex flex-wrap items-center justify-between gap-2">
      <span>{check.label}</span><StatusBadge tone={check.ready ? "success" : "warning"}>{check.ready ? "Ready" : "Required"}</StatusBadge>
    </li>)}</ul>
    <p id="activation-note" className="mt-2 text-sm text-muted">The payment collection panel checks printer approval, the published final proof and current eligibility again before activation. Reaching ten reservations does not charge anyone. Each zone is reviewed independently.</p>
  </Card>;
}
