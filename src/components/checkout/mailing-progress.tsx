import type { customerMailing } from "@/lib/mailing/customer";
import { formatDay } from "@/lib/format-admin";
export function MailingProgress({data}:{data:Awaited<ReturnType<typeof customerMailing>>}) {
 return <section className="rounded-2xl border border-line p-6"><h2 className="text-xl font-semibold">Your campaign progress</h2>
 <p className="mt-3 text-sm">Expected mailing: {data.windowStart&&data.windowEnd?`${formatDay(data.windowStart)}–${formatDay(data.windowEnd)}`:"Dates awaiting confirmation"}. Dates remain estimates until confirmed by the mailing provider.</p>
 <ol className="my-4 grid gap-2 sm:grid-cols-2">{data.timeline.map(step=><li key={step.label} className="text-sm"><span aria-hidden="true">{step.complete?"✓":"○"}</span> {step.label} · {step.complete?"Recorded":"Awaiting confirmation"}</li>)}</ol>
 <h3 className="font-semibold">Published mailing documents</h3>
 {data.documents.length?<ul className="mt-2 space-y-2">{data.documents.map(d=><li key={d.id}><a className="underline" href={`/reservation/evidence/${d.id}`} target="_blank" rel="noreferrer noopener">{d.title}</a>{d.event_date&&<span className="text-sm text-muted"> · {formatDay(d.event_date)}</span>}</li>)}</ul>:<p className="mt-2 text-sm text-muted">No current mailing documents have been published yet.</p>}
 <p className="mt-3 text-xs text-muted">Documents are shared only after Inside914 reviews and publishes them. Postal acceptance does not establish delivery to every household. Previewing or downloading artwork does not mean a postcard was mailed.</p></section>;
}
