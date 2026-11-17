import Link from "next/link";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { MarketingPageSeo } from "@/components/marketing/page-seo";
import { SizeDiagram } from "@/components/marketing/postcard-illustration";
import { Card } from "@/components/ui/primitives";
import { ADVERTISED_BACK_PRICE_LABEL, ADVERTISED_PRICE_LABEL, MARKETING_PAGES } from "@/lib/marketing-content";
import { marketingMetadata } from "@/lib/seo";
import { postcardService } from "@/lib/structured-data";

const copy = MARKETING_PAGES["/pricing"];
export const metadata = marketingMetadata("/pricing", copy.title, copy.description);

export default function PricingPage() {
  return <MarketingPage path="/pricing" title="Postcard advertising pricing." intro="One advertising space. One selected Westchester area. Share the postcard with other local businesses and reserve with nothing charged today.">
    <MarketingPageSeo path="/pricing" mainEntity={{ "@id": postcardService["@id"] }} entities={[postcardService]} />
    <div className="mt-10 grid items-start gap-8 md:grid-cols-2">
      <Card className="flex flex-col items-start gap-6 sm:flex-row">
        <SizeDiagram />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-medium">Postcard Advertisement</h2>
          <dl className="mt-3 space-y-4">
            <div><dt className="text-sm text-muted">Front space · 6 positions</dt><dd className="font-display text-5xl font-medium">{ADVERTISED_PRICE_LABEL}</dd></div>
            <div><dt className="text-sm text-muted">Smaller back space · 4 positions</dt><dd className="font-display text-5xl font-medium">{ADVERTISED_BACK_PRICE_LABEL}</dd></div>
          </dl>
          <p className="mt-2 font-medium">Per area</p>
          <p className="mt-4 leading-relaxed text-muted">One advertising space on a shared postcard mailed within your selected Westchester area.</p>
          <p className="mt-4 text-sm leading-relaxed text-muted">Review the selected campaign’s agreed price before reserving. Each area has its own campaign and 10 advertising spaces.</p>
        </div>
      </Card>
      <section>
        <h2 className="font-display text-3xl font-medium">What your space covers</h2>
        <ul className="mt-4 list-disc space-y-3 pl-5 leading-relaxed text-muted">
          <li>One available advertising position on the shared postcard.</li>
          <li>Your uploaded artwork for that selected area and position.</li>
          <li>Participation in the campaign’s shared printing and mailing.</li>
          <li>A private reservation page to follow campaign progress.</li>
        </ul>
        <p className="mt-4 leading-relaxed text-muted">Final mailing routes, household quantities, dates and artwork requirements are confirmed for each campaign. Explore the <Link href="/areas" className="underline underline-offset-4">advertising areas</Link> for available campaigns and their details.</p>
      </section>
    </div>
    <div className="mt-12 grid gap-8 md:grid-cols-2">
      <section><h2 className="font-display text-3xl font-medium">When payment happens</h2><p className="mt-4 leading-relaxed text-muted">Your reservation saves your card securely and charges $0 today. You are charged the agreed amount for an area only after its campaign fills and is approved. An area that has not met those conditions is not charged.</p></section>
      <section><h2 className="font-display text-3xl font-medium">Choosing multiple areas</h2><p className="mt-4 leading-relaxed text-muted">Select as many available areas as fit your business. Each has its own price, position and artwork. Your reservation shows the combined agreed total, while campaign approval and payment are handled separately for each area.</p></section>
    </div>
    <p className="mt-8 text-sm leading-relaxed text-muted">Read the <Link href="/legal/reservation-policy" className="underline underline-offset-4">reservation policy</Link> for cancellation terms, or <Link href="/contact" className="underline underline-offset-4">contact us</Link> before reserving.</p>
  </MarketingPage>;
}
