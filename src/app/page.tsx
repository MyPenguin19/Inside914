import { PostcardIllustration, SizeDiagram } from "@/components/marketing/postcard-illustration";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, Eyebrow, SectionHeading } from "@/components/ui/primitives";

const TRUST = [
  { title: "Reserve without paying upfront", body: "Save your space today. Nothing is charged at reservation." },
  { title: "Preview your advertisement", body: "See your selected position and artwork before the postcard is mailed." },
  { title: "Follow campaign progress", body: "See when your area fills, artwork is approved, and the campaign moves toward mailing." },
  { title: "Receive mailing documentation", body: "After mailing, access the available documentation for your campaign." },
];

const STEPS = [
  { title: "Choose your areas", body: "Pick one or more areas on the map." },
  { title: "Choose positions and artwork", body: "Pick a position and add your image. Use the same image or a different one in each area." },
  { title: "Add your business details", body: "Tell us your business name and how to reach you." },
  { title: "Reserve securely", body: "Save your card. Pay $0 today, then the agreed price per area when its postcard fills and is approved." },
];

const FAQ = [
  {
    q: "How does shared mail work?",
    a: "Multiple local businesses share one professionally printed postcard mailed within a selected Westchester area. Each campaign has 10 paid advertising spaces. Choose one or multiple areas, with a separate position and artwork for each.",
  },
  {
    q: "When am I charged?",
    a: "Nothing is charged when you reserve. Your card is saved securely. Each selected area is independent: you are charged the agreed price for an area only after that campaign fills and is approved.",
  },
  {
    q: "What if the postcard doesn't fill?",
    a: "You are not charged for an area unless its campaign fills and is approved. If it isn't fully reserved by its deadline, that reservation is canceled without charge. Other selected areas are handled independently.",
  },
  {
    q: "What happens after I reserve?",
    a: "You receive a confirmation email with a private link to your reservation. Each area moves from reservation to artwork review, a filled campaign, final preparation, payment, and mailing. Follow progress on your private campaign page.",
  },
  {
    q: "How does mailing verification work?",
    a: "Your private campaign page shows campaign progress and the mailing documentation made available after mailing. It does not provide tracking for individual mailpieces.",
  },
  {
    q: "Can I change my artwork?",
    a: "Yes. Before reserving, you can replace or adjust your artwork. After reserving, contact us for help with changes before the applicable artwork deadline and final approval or production lock.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="page-width grid items-center gap-10 overflow-x-clip pb-12 pt-10 md:grid-cols-[1.15fr_1fr] md:gap-12 md:pb-16 md:pt-14">
          <div>
            <Eyebrow>WESTCHESTER COUNTY · SHARED DIRECT MAIL</Eyebrow>
            <h1 className="mt-4 font-display text-[2.6rem] font-medium leading-[1.05] tracking-tight sm:text-6xl">
              Your Business.
              <br />
              Thousands of Local Mailboxes.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Put your business in Westchester mailboxes. Pick your areas, choose a position, and add your ad. Pay nothing today.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/areas" size="lg">
                View Available Spaces
              </ButtonLink>
              <ButtonLink href="#how-it-works" size="lg" variant="secondary">
                How It Works
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-muted">Prices shown per area · Choose one or multiple areas · $0 today</p>
          </div>
          <PostcardIllustration />
        </section>

        {/* How it works */}
        <section id="how-it-works" aria-labelledby="how-title" className="page-width section-y scroll-mt-20">
          <SectionHeading id="how-title" eyebrow="How it works" title="Four simple steps." />
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative rounded-2xl border border-line bg-surface p-5">
                <span className="font-display text-3xl text-accent">{i + 1}</span>
                <h3 className="mt-3 font-medium">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Pricing */}
        <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 border-y border-line bg-background-soft">
          <div className="page-width section-y">
            <SectionHeading
              id="pricing-title"
              eyebrow="Pricing"
              title="Simple, clear pricing."
              intro="Choose one advertising space at the price listed for each Westchester area. Choose as many available areas as you want. Nothing is charged today."
            />
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <PriceCard
                name="Postcard Advertisement"
                price="Price per area"
                detail="One advertising space on a shared postcard mailed within your selected Westchester area."
                diagram={<SizeDiagram />}
              />

            </div>
            <p className="mt-6 text-sm text-muted">
              Each area is its own campaign with 10 advertising spaces.
            </p>
          </div>
        </section>

        {/* Verified Mail / trust */}
        <section id="verified-mail" aria-labelledby="verified-title" className="scroll-mt-20 border-b border-line bg-surface">
          <div className="page-width section-y">
            <SectionHeading
              id="verified-title"
              eyebrow="Inside914 Verified Mail"
              title="Advertising you can actually follow."
              intro="Know what’s happening after you reserve. Inside914 gives each advertiser a private campaign page so you can follow your advertisement from reservation through mailing."
            />
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {TRUST.map((item) => (
                <li key={item.title} className="rounded-2xl border border-line bg-background p-5">
                  <span aria-hidden="true" className="block h-1 w-8 rounded-full bg-accent" />
                  <h3 className="mt-4 font-medium">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="page-width section-y grid scroll-mt-20 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] lg:gap-12">
          <SectionHeading id="faq-title" eyebrow="Questions" title="Good to know." />
          <div className="divide-y divide-line self-start rounded-2xl border border-line bg-surface">
            {FAQ.map((item) => (
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

        {/* Closing CTA */}
        <section className="page-width pb-14 md:pb-16">
          <Card tone="dark" className="flex flex-col items-start justify-between gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
            <div>
              <h2 className="font-display text-3xl font-medium">Ready to advertise locally?</h2>
              <p className="mt-2 text-background/75">See available spaces across our Westchester advertising areas.</p>
            </div>
            <ButtonLink href="/areas" size="lg" variant="inverse">
              View Available Spaces
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
    <Card className={`flex gap-6 ${highlight ? "ring-2 ring-accent" : ""}`}>
      {diagram}
      <div className="flex flex-col">
        <h3 className="font-medium">{name}</h3>
        <p className="mt-1 font-display text-4xl font-medium">{price}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">{detail}</p>
      </div>
    </Card>
  );
}
