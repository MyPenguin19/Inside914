import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ContactMessageForm } from "@/components/contact-message-form";
import { Card, Eyebrow } from "@/components/ui/primitives";
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "@/lib/support";
import { MARKETING_PAGES } from "@/lib/marketing-content";
import { MarketingBreadcrumb, MarketingPageSeo } from "@/components/marketing/page-seo";
import { marketingMetadata, SITE_URL } from "@/lib/seo";

const copy = MARKETING_PAGES["/contact"];
export const metadata = marketingMetadata("/contact", copy.title, copy.description);

export default function ContactPage() {
  return <>
    <SiteHeader />
    <MarketingPageSeo path="/contact" type="ContactPage" mainEntity={{ "@id": `${SITE_URL}/#organization` }} />
    <main id="main-content" tabIndex={-1} className="page-width flex-1 break-words py-10 sm:py-14">
      <MarketingBreadcrumb label="Contact" />
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
        <div className="min-w-0">
          <Eyebrow>Get in touch</Eyebrow>
          <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">Contact Inside914</h1>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-muted">Have a question about advertising? Send us a message.</p>
          <ul className="mt-8 space-y-4 text-base">
            <li><a href={`mailto:${SUPPORT_EMAIL}`} className="break-words underline underline-offset-4">{SUPPORT_EMAIL}</a></li>
            <li><a href={SUPPORT_PHONE_HREF} className="underline underline-offset-4">{SUPPORT_PHONE}</a></li>
            <li className="text-muted">Westchester County, NY</li>
          </ul>
        </div>
        <Card className="min-w-0"><h2 className="mb-5 font-display text-2xl font-medium">Send a message</h2><ContactMessageForm /></Card>
      </div>
    </main>
    <SiteFooter />
  </>;
}
