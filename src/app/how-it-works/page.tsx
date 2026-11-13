import Link from "next/link";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { MarketingPageSeo } from "@/components/marketing/page-seo";
import { Card } from "@/components/ui/primitives";
import { CAMPAIGN_STEPS, MARKETING_PAGES } from "@/lib/marketing-content";
import { marketingMetadata } from "@/lib/seo";

const copy = MARKETING_PAGES["/how-it-works"];
export const metadata = marketingMetadata("/how-it-works", copy.title, copy.description);

export default function HowItWorksPage() {
  return <MarketingPage path="/how-it-works" title="How shared postcard advertising works." intro="Share a postcard with other local businesses and choose the Westchester areas that fit your customers. From selecting a position to following your campaign, here is what to expect.">
    <MarketingPageSeo path="/how-it-works" />
    <ol className="mt-10 grid gap-5 md:grid-cols-2">
      {CAMPAIGN_STEPS.map((step, index) => <li key={step.title}>
        <Card className="h-full"><span className="font-display text-3xl text-accent">{index + 1}</span><h2 className="mt-3 font-display text-2xl font-medium">{step.title}</h2><p className="mt-3 leading-relaxed text-muted">{step.detail}</p></Card>
      </li>)}
    </ol>
    <section className="mt-12 max-w-3xl border-t border-line pt-8">
      <h2 className="font-display text-3xl font-medium">After you reserve</h2>
      <p className="mt-4 leading-relaxed text-muted">Your reservation progresses through artwork review and campaign preparation. Each area must fill and be approved before its agreed payment is collected. Final preparation and mailing follow the individual campaign schedule. Use the private link in your confirmation email to follow its progress.</p>
      <p className="mt-4 leading-relaxed text-muted">If a campaign does not fill by its deadline, new reservations close while Inside914 reviews cancellation or revised dates. Other areas in your reservation continue independently. The <Link href="/faq" className="underline underline-offset-4">advertising FAQ</Link> explains payment timing and artwork changes.</p>
    </section>
    <section className="mt-10 max-w-3xl border-t border-line pt-8">
      <h2 className="font-display text-3xl font-medium">Plan your message before choosing a position</h2>
      <p className="mt-4 leading-relaxed text-muted">Start with one clear offer or service, your business name and an easy next step. Check the <Link href="/our-postcard" className="underline underline-offset-4">interactive postcard sample</Link> to see how your ad fits alongside neighboring businesses, then review <Link href="/pricing" className="underline underline-offset-4">pricing per area</Link>.</p>
    </section>
  </MarketingPage>;
}
