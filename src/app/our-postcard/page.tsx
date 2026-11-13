import Link from "next/link";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { MarketingPageSeo } from "@/components/marketing/page-seo";
import { PostcardIllustration } from "@/components/marketing/postcard-illustration";
import { MARKETING_PAGES } from "@/lib/marketing-content";
import { marketingMetadata } from "@/lib/seo";

const copy = MARKETING_PAGES["/our-postcard"];
export const metadata = marketingMetadata("/our-postcard", copy.title, copy.description);

export default function OurPostcardPage() {
  return <MarketingPage path="/our-postcard" title="One postcard. Ten local businesses." intro="See how a shared postcard brings local advertising together. Flip the interactive sample to explore both sides and plan where your business could appear.">
    <MarketingPageSeo path="/our-postcard" />
    <div className="mt-10 grid items-start gap-10 lg:grid-cols-2">
      <PostcardIllustration />
      <div className="space-y-8">
        <section><h2 className="font-display text-3xl font-medium">Six spaces on the front</h2><p className="mt-4 leading-relaxed text-muted">The front groups six paid advertising positions in two rows. Each space gives a business room for a clear message, an offer and contact details. The sample business names and artwork are illustrative.</p></section>
        <section><h2 className="font-display text-3xl font-medium">Four spaces on the back</h2><p className="mt-4 leading-relaxed text-muted">The back adds four paid positions beside the Inside914 panel and the reserved mailing panel. Address and postage information have their own space, separate from advertiser artwork.</p></section>
        <p className="text-sm leading-relaxed text-muted">The sample explains the layout. Live position availability appears on the <Link href="/areas" className="underline underline-offset-4">advertising areas page</Link>, and the final layout and print requirements are confirmed for each campaign.</p>
      </div>
    </div>
    <section className="mt-12 max-w-3xl">
      <h2 className="font-display text-3xl font-medium">Prepare an ad people can read quickly</h2>
      <ul className="mt-4 list-disc space-y-3 pl-5 leading-relaxed text-muted">
        <li>Lead with your business name and one service or offer.</li>
        <li>Include a clear way to respond: a phone number, short web address or business location.</li>
        <li>Keep text readable and leave room around important details when previewing the crop.</li>
        <li>Check spelling, offer conditions and contact details before submitting artwork.</li>
      </ul>
      <p className="mt-4 leading-relaxed text-muted">For artwork questions, <Link href="/contact" className="underline underline-offset-4">contact Inside914</Link>. You can also review <Link href="/how-it-works" className="underline underline-offset-4">the reservation steps</Link> before choosing an area.</p>
    </section>
  </MarketingPage>;
}
