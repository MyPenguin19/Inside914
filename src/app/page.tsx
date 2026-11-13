import Link from "next/link";
import { marketingMetadata } from "@/lib/seo";
import { ADVERTISED_PRICE_LABEL, ADVERTISING_FAQ, CAMPAIGN_STEPS, HOME_INTRO, MARKETING_PAGES } from "@/lib/marketing-content";
import { MarketingPageSeo } from "@/components/marketing/page-seo";
import { PUBLIC_CHECKOUT_RELEASED, CHECKOUT_CLOSED_MESSAGE } from "@/lib/checkout/release";
import { REGIONS } from "@/lib/catalog/regions";
import { PostcardIllustration, SizeDiagram } from "@/components/marketing/postcard-illustration";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, Eyebrow, SectionHeading } from "@/components/ui/primitives";

const copy = MARKETING_PAGES["/"];
export const metadata = marketingMetadata("/", copy.title, copy.description);

export default function Home() {
  return (
    <>
      <SiteHeader />
      <MarketingPageSeo path="/" />
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 break-words">
        {/* Hero */}
        <section className="page-width grid items-center gap-10 overflow-x-clip pb-12 pt-10 md:grid-cols-[1.15fr_1fr] md:gap-12 md:pb-16 md:pt-14">
          <div className="min-w-0">
            <Eyebrow>WESTCHESTER COUNTY · SHARED DIRECT MAIL</Eyebrow>
            <h1 className="mt-4 text-balance font-display text-[2.6rem] font-medium leading-[1.08] tracking-tight sm:text-6xl">
              Your Business.
              <br />
              Westchester Mailboxes.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              {HOME_INTRO}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/areas" size="lg">
                Explore Advertising Areas
              </ButtonLink>
              <ButtonLink href="/how-it-works" size="lg" variant="secondary">
                How It Works
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-muted">Prices shown per area · Choose one or multiple areas · $0 at reservation</p>
            {!PUBLIC_CHECKOUT_RELEASED && <p className="mt-3 max-w-xl text-sm text-muted">{CHECKOUT_CLOSED_MESSAGE}</p>}
          </div>
          <div className="min-w-0">
            <PostcardIllustration />
            <p className="mt-5 text-center text-sm"><Link href="/our-postcard" className="underline underline-offset-4 hover:text-accent">Explore the postcard layout and artwork tips</Link></p>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" aria-labelledby="how-title" className="page-width section-y scroll-mt-20">
          <SectionHeading id="how-title" eyebrow="How it works" title="Four simple steps." />
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CAMPAIGN_STEPS.map((step, i) => (
              <li key={step.title} className="relative rounded-2xl border border-line bg-surface p-5">
                <span className="font-display text-3xl text-accent">{i + 1}</span>
                <h3 className="mt-3 font-medium">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
          <Link href="/how-it-works" className="mt-6 inline-block text-sm font-medium underline underline-offset-4 hover:text-accent">See the full campaign process</Link>
        </section>

        {/* Pricing */}
        <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 border-y border-line bg-background-soft">
          <div className="page-width section-y grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
            <div>
            <SectionHeading
              id="pricing-title"
              eyebrow="Pricing"
              title="Simple, clear pricing."
              intro="Choose one advertising space at the price listed for each Westchester area. Choose as many available areas as you want. Nothing is charged today."
            />
              <p className="mt-5 text-sm leading-relaxed text-muted">Each area is its own campaign with 10 advertising spaces.</p>
              <Link href="/pricing" className="mt-5 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 hover:text-accent">View pricing and payment details</Link>
            </div>
            <div>
              <PriceCard
                name="Postcard Advertisement"
                price={ADVERTISED_PRICE_LABEL}
                detail="One advertising space on a shared postcard mailed within your selected Westchester area."
                diagram={<SizeDiagram />}
              />

            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="page-width section-y grid scroll-mt-20 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] lg:gap-12">
          <div>
            <SectionHeading id="faq-title" eyebrow="Questions" title="Good to know." />
            <Link href="/faq" className="mt-4 inline-block text-sm font-medium underline underline-offset-4 hover:text-accent">Read all advertising questions</Link>
          </div>
          <div className="divide-y divide-line self-start rounded-2xl border border-line bg-surface">
            {ADVERTISING_FAQ.slice(0, 5).map((item) => (
              <details key={item.q} className="group">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3.5 font-medium [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span aria-hidden="true" className="text-xl text-muted transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="px-5 pb-4 leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Crawlable regional links complement the interactive area selector. */}
        <section className="page-width pb-14" aria-labelledby="area-links-title">
          <h2 id="area-links-title" className="font-display text-3xl font-medium">Explore Westchester advertising areas</h2>
          <p className="mt-3 max-w-2xl text-muted">Compare the four proposed regions before exploring campaign positions and prices.</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {REGIONS.map(area => <li key={area.slug}><Link className="block rounded-xl border border-line bg-surface p-4 font-medium hover:border-accent hover:text-accent" href={`/areas/${area.slug}`}>{area.name}</Link></li>)}
          </ul>
        </section>
        {/* Closing CTA */}
        <section className="page-width pb-14 md:pb-16">
          <Card tone="dark" className="flex flex-col items-start justify-between gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
            <div className="min-w-0 max-w-full">
              <h2 className="font-display text-3xl font-medium">Ready to advertise locally?</h2>
              <p className="mt-2 text-background/75">See available spaces across our Westchester advertising areas.</p>
            </div>
            <ButtonLink href="/areas" size="lg" variant="inverse">
              Explore Advertising Areas
            </ButtonLink>
          </Card>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function PriceCard({ name, price, detail, diagram, highlight = false }: { name: string; price: string; detail: string; diagram: React.ReactNode; highlight?: boolean }) {
  return (
    <Card className={`flex flex-col items-start gap-6 sm:flex-row ${highlight ? "ring-2 ring-accent" : ""}`}>
      {diagram}
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-medium">{name}</h3>
        <p className="mt-2 font-display text-5xl font-medium">{price}</p>
        <p className="mt-1 text-sm font-medium">Per area</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">{detail}</p>
      </div>
    </Card>
  );
}
