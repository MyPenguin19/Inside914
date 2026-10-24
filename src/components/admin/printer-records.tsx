import { findPostcardLayout, isLayoutV2 } from "@/lib/print/layouts";
import { publishEvidence } from "@/app/admin/admin-actions";
import { requireAdmin } from "@/lib/admin/auth";
import { listEvidence, signEvidence } from "@/lib/admin/data";
import { ConfirmAction } from "./confirm-action";
import { EvidenceForm } from "./evidence-form";
import { EmptyState } from "./ui";
import { Card, StatusBadge } from "@/components/ui/primitives";
import { formatTimestamp, formatDay, formatHouseholds } from "@/lib/format-admin";
const KIND: Record<string,string> = {printer_confirmation:"Printer confirmation", final_proof:"Final approved proof",postal_acceptance:"Postal acceptance receipt",mailing_confirmation:"Mailing confirmation",other:"Other"};
export async function PrinterRecords({editionId}:{editionId:string}) {
 const {supabase}=await requireAdmin();
 const e={id:editionId};
 const {data:edition}=await supabase.from("editions").select("layout_template").eq("id",editionId).single();
 const layout=findPostcardLayout(edition?.layout_template);
 const evidence=await listEvidence(supabase,editionId);
 const evidenceLinks=await Promise.all(evidence.map(x=>x.storage_path ? signEvidence(x.storage_path) : null));
 return <details><summary className="cursor-pointer text-lg font-semibold">Advanced / Printer Records</summary>
 <p className="my-4 text-sm text-muted">{isLayoutV2(layout?.key) ? "V2: front 2.78 × 2.78 inches; back 2.2925 × 2.815 inches. Paid/postal clearance 0.3075 inch; house/postal gap 0.125 inch." : "V1: paid squares remain 2.5 × 2.5 inches. Back paid/postal clearance is only 0.0125 inch; the house panel touches the postal boundary."} Reservation geometry is approved; final printing still requires printer confirmation covering the current customer and house artwork. Export: 7300 × 4900 pixels, 800 DPI metadata; advertiser source: at least 300 effective DPI at its placed size. Resampling adds no detail. Mailing-service eligibility, including EDDM, is not certified.</p>
      <section aria-labelledby="evidence-title">
        <h2 id="evidence-title" className="text-lg font-semibold">
          Mailing evidence
        </h2>
        <p className="mt-1 text-sm text-muted">
          Keep the printer’s final approved proof here. Approve it only after checking the current advertiser and permanent house artwork. Mailing receipts are optional.
        </p>
        {evidence.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No evidence uploaded for this campaign." />
          </div>
        ) : (
          <ul className="mt-3 grid gap-2">
            {evidence.map((x, i) => (
              <li
                key={x.id}
                className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 text-sm sm:flex-row sm:items-start sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {x.title} <span className="font-normal text-muted">· {KIND[x.kind] ?? x.kind}</span>
                  </p>
                  <p className="text-muted">
                    Uploaded {formatTimestamp(x.uploaded_at)}
                    {x.event_date && ` · dated ${formatDay(x.event_date)}`}
                    {x.quantity_printed !== null && ` · printed ${formatHouseholds(x.quantity_printed)}`}
                    {x.quantity_accepted !== null && ` · accepted ${formatHouseholds(x.quantity_accepted)}`}
                  </p>
                  {x.notes && <p className="mt-1">{x.notes}</p>}
                  {evidenceLinks[i] && (
                    <a
                      href={evidenceLinks[i]!}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1 inline-block underline-offset-4 hover:underline"
                    >
                      Open file (link expires shortly)
                    </a>
                  )}
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <StatusBadge tone={x.published_at ? "success" : "neutral"}>
                    {x.published_at ? `Published ${formatTimestamp(x.published_at)}` : "Not published"}
                  </StatusBadge>
                  <ConfirmAction
                    label={x.kind === "final_proof" ? (x.published_at ? "Withdraw proof approval" : "Approve final proof") : (x.published_at ? "Unpublish" : "Publish")}
                    action={publishEvidence}
                    fields={{
                      evidence_id: x.id,
                      publish: x.published_at ? "false" : "true",
                    }}
                    confirmLabel={x.kind === "final_proof" ? (x.published_at ? "Withdraw approval" : "Approve proof") : (x.published_at ? "Unpublish" : "Publish")}
                    consequence={
                      x.published_at ? (
                        <>Hides this document from advertisers again. The file and its history are kept.</>
                      ) : (
                        <>Shares this document with every advertiser in this campaign. Confirm it is genuine, current and safe to share; remove private contact, payment and unrelated customer information first. Printer confirmation must document the actual handoff, not a quote.</>
                      )
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <Card className="mt-4">
          <h3 className="font-medium">Add evidence</h3>
          <div className="mt-4">
            <EvidenceForm editionId={e.id} />
          </div>
        </Card>
      </section>
 </details>;
}
