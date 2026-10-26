import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ContactMessageForm } from "@/components/contact-message-form";
import { Card, Eyebrow } from "@/components/ui/primitives";
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "@/lib/support";
import { marketingMetadata } from "@/lib/seo";

export const metadata = marketingMetadata("/contact", "Contact Us for Westchester Advertising", "Contact Inside914 about postcard advertising in Westchester County. Send a message, email Info@inside914.com or call 914-879-5022 to get in touch.");

export default function ContactPage() {
  return <>
    <SiteHeader />
    <main className="page-width flex-1 py-12 sm:py-16">
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
        <Card className="min-w-0"><ContactMessageForm /></Card>
      </div>
    </main>
    <SiteFooter />
  </>;
}
