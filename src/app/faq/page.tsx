import Link from "next/link";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { MarketingPageSeo } from "@/components/marketing/page-seo";
import { ADVERTISING_FAQ, MARKETING_PAGES } from "@/lib/marketing-content";
import { marketingMetadata } from "@/lib/seo";
import { faqQuestions } from "@/lib/structured-data";

const copy = MARKETING_PAGES["/faq"];
export const metadata = marketingMetadata("/faq", copy.title, copy.description);

export default function FaqPage() {
  return <MarketingPage path="/faq" title="Postcard advertising questions, answered." intro="Find out how shared campaigns, reservations and artwork work before choosing your Westchester advertising areas.">
    <MarketingPageSeo path="/faq" type="FAQPage" mainEntity={faqQuestions} />
    <div className="mt-10 max-w-3xl divide-y divide-line">
      {ADVERTISING_FAQ.map(({ q, a }, index) => <section key={q} id={`question-${index + 1}`} className="scroll-mt-24 py-7 first:pt-0">
        <h2 className="font-display text-2xl font-medium">{q}</h2>
        <p className="mt-3 leading-relaxed text-muted">{a}</p>
      </section>)}
    </div>
    <p className="mt-8 max-w-3xl leading-relaxed text-muted">Still have a question? <Link href="/contact" className="underline underline-offset-4">Send us a message</Link>, explore <Link href="/pricing" className="underline underline-offset-4">advertising prices</Link>, or read the <Link href="/legal/reservation-policy" className="underline underline-offset-4">reservation policy</Link> for the full terms.</p>
  </MarketingPage>;
}
