import { Suspense } from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { PageHeader } from "@/components/admin/ui";
export default function Page() { return <Suspense fallback={<p>Loading…</p>}><Home /></Suspense>; }
async function Home() {
  await requireAdmin();
  return <div className="space-y-6"><PageHeader title="Manage Inside914" description="Four simple steps to run your mailing." />
    <div className="grid gap-4 sm:grid-cols-2">{[
      ["1. Campaigns", "Create a campaign, choose its area and dates, then open reservations.", "/admin/campaigns"],
      ["2. Advertisers", "Find contact details and manage reservations.", "/admin/advertisers"],
      ["3. Artwork Approval", "Review every advertisement. Download the front and back from its campaign.", "/admin/artwork"],
      ["4. Payments", "When a campaign fills, review saved cards and approve collection.", "/admin/payments"],
    ].map(([title, description, href]) => <Card key={href}><h2 className="text-xl font-semibold">{title}</h2><p className="my-3 text-muted">{description}</p><ButtonLink href={href} variant="secondary">{title.slice(3)}</ButtonLink></Card>)}</div>
    <p className="text-sm text-muted">Nothing is charged automatically. Each area is managed independently.</p>
  </div>;
}
