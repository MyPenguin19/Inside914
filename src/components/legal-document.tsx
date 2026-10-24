import policies from "@/lib/legal/versions/2026-10-24-review-4.json";
import { SUPPORT_EMAIL } from "@/lib/support";

// Immutable proposed text is shared by the renderer and the version archive.
export const legalDocuments = policies.documents;
export const LEGAL_VERSION = policies.version;
type Document = (typeof legalDocuments)[keyof typeof legalDocuments];

function InlineText({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*|Info@inside914\.com|https:\/\/inside914\.vercel\.app)/g).map((part, i) => {
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part === SUPPORT_EMAIL) return <a key={i} className="break-words underline" href={`mailto:${SUPPORT_EMAIL}`}>{part}</a>;
    if (part === "https://inside914.vercel.app") return <a key={i} className="break-words underline" href={part}>{part}</a>;
    return part;
  });
}

export function LegalDocument({ document }: { document: Document }) {
  return <article className="break-words leading-7">
    <h1 className="mt-6 text-3xl font-semibold tracking-tight">Inside914 — {document.title}</h1>
    <p className="mt-4">Operated by Inside Diagnostics LLC</p>
    <p>Contact: <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
    {document.sections.map(section => <section key={section.heading} className="mt-8">
      <h2 className="text-lg font-semibold">{section.heading}</h2>
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
