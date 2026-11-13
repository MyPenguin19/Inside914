import Link from "next/link";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { MarketingPageSeo } from "@/components/marketing/page-seo";
import { MARKETING_PAGES } from "@/lib/marketing-content";
import { marketingMetadata, SITE_URL } from "@/lib/seo";
import { BUSINESS_ADDRESS_LABEL } from "@/lib/support";

const copy = MARKETING_PAGES["/about"];
export const metadata = marketingMetadata("/about", copy.title, copy.description);

export default function AboutPage() {
  return <MarketingPage path="/about" title="Local businesses. Westchester mailboxes."
    intro="Inside914 brings local businesses together on shared postcards for Westchester County, New York.">
    <MarketingPageSeo path="/about" type="AboutPage" mainEntity={{ "@id": `${SITE_URL}/#organization` }} />
    <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:gap-12">
      <section aria-labelledby="about-advertising">
        <h2 id="about-advertising" className="font-display text-3xl font-medium">One postcard. Shared advertising.</h2>
        <p className="mt-4 leading-relaxed text-muted">Each shared postcard has ten paid advertising spaces: six on the front and four on the back. Businesses choose an available position and supply their artwork, sharing the postcard with other local advertisers.</p>
        <p className="mt-4 leading-relaxed text-muted">Our advertising areas cover Central, Southern, Northern and Eastern Westchester. Each area runs as a separate campaign, with its own agreed price, availability and mailing details.</p>
        <Link href="/how-it-works" className="mt-4 inline-flex min-h-11 items-center underline underline-offset-4 hover:text-accent">Learn how a campaign works</Link>
      </section>
      <section aria-labelledby="about-business">
        <h2 id="about-business" className="font-display text-3xl font-medium">The business behind Inside914.</h2>
        <p className="mt-4 leading-relaxed text-muted">Inside914 is operated by Inside Diagnostics LLC.</p>
        <address className="mt-4 not-italic leading-relaxed text-muted">{BUSINESS_ADDRESS_LABEL}</address>
        <p className="mt-4 leading-relaxed text-muted">Have a question about an area, artwork or your reservation? Get in touch with us for help planning your campaign.</p>
        <Link href="/contact" className="mt-4 inline-flex min-h-11 items-center underline underline-offset-4 hover:text-accent">Contact Inside914</Link>
      </section>
    </div>
  </MarketingPage>;
}
