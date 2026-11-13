import policies from "@/lib/legal/versions/2026-11-02-reservations-1.json";
import { SUPPORT_EMAIL } from "@/lib/support";
import { SITE_URL } from "@/lib/seo";
import type { PolicyDocument } from "@/lib/legal/public-policies";

// Immutable owner-approved text is shared by the renderer and the version archive.
export const legalDocuments = policies.documents;
export const LEGAL_VERSION = policies.version;

function InlineText({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*|Info@inside914\.com|https:\/\/inside914\.com)/g).map((part, i) => {
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part === SUPPORT_EMAIL) return <a key={i} className="break-words underline" href={`mailto:${SUPPORT_EMAIL}`}>{part}</a>;
    if (part === SITE_URL) return <a key={i} className="break-words underline" href={SITE_URL}>{SITE_URL}</a>;
    return part;
  });
}

export function LegalDocument({ document }: { document: PolicyDocument }) {
  return <article className="min-w-0 break-words leading-7">
    <h1 className="mt-8 text-balance font-display text-3xl font-medium leading-tight tracking-tight sm:text-4xl">Inside914 — {document.title}</h1>
    <p className="mt-4 text-sm text-muted">Operated by Inside Diagnostics LLC</p>
    <p className="text-sm text-muted">Contact: <a className="underline underline-offset-4" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
    {document.intro && <p className="mt-6 text-lg leading-relaxed text-muted">{document.intro}</p>}
    <details className="group mt-8 rounded-xl border border-line bg-surface p-5">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 font-medium">On this page <span aria-hidden="true" className="text-xl group-open:rotate-45">+</span></summary>
      <nav aria-label="Policy sections" className="mt-3">
        <ul className="space-y-1">
          {document.sections.map((section, index) => <li key={section.heading}><a href={`#policy-section-${index + 1}`} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 hover:text-accent">{section.heading}</a></li>)}
        </ul>
      </nav>
    </details>
    {document.sections.map((section, index) => <section id={`policy-section-${index + 1}`} key={section.heading} className="mt-9 scroll-mt-28 border-t border-line pt-7">
      <h2 className="text-xl font-semibold leading-snug">{section.heading}</h2>
      {section.blocks.map((block, i) => {
        if (block.type === "paragraph") return <p key={i} className="mt-3 text-muted"><InlineText text={block.text!} /></p>;
        const List = block.type === "ordered" ? "ol" : "ul";
        return <List key={i} className={`mt-3 space-y-2 pl-6 text-muted ${block.type === "ordered" ? "list-decimal" : "list-disc"}`}>
          {block.items!.map(item => <li key={item}><InlineText text={item} /></li>)}
        </List>;
      })}
    </section>)}
  </article>;
}
