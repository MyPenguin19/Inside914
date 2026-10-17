import { PostcardIllustration, SizeDiagram } from "@/components/marketing/postcard-illustration";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, Eyebrow, SectionHeading } from "@/components/ui/primitives";

const TRUST = [
  { title: "Reserve without an upfront charge", body: "Save your space today. You're only charged if the postcard fills and the campaign is approved." },
  { title: "Preview your advertisement", body: "See exactly where your ad sits on the postcard before you reserve." },
  { title: "Follow campaign progress", body: "A private page shows each step, from artwork approval to printing and mailing." },
  { title: "Receive mailing documentation", body: "When it's available, we share the documentation for your edition's mailing." },
];

const STEPS = [
  { title: "Choose your advertising area", body: "Start with Central Westchester. We handle the mailing routes for you." },
  { title: "Select your postcard space", body: "Pick an open space on the front or back. Go double-size for more impact." },
  { title: "Upload and adjust your ad", body: "Add your image, then drag and zoom until it fits. You'll see it on the card." },
  { title: "Reserve securely", body: "Save a card to hold your space. You pay only when the campaign is confirmed." },
];

const FAQ = [
  {
    q: "How does shared mail work?",
    a: "A small group of local businesses share one large, professionally printed postcard. Each business has its own space, and Inside914 handles printing and mailing to homes in the area. Sharing the card keeps the cost per business far lower than a solo mailing.",
  },
  {
    q: "When am I charged?",
    a: "Not when you reserve. You save a card and authorize the amount shown. We charge it only once every space on the postcard is reserved and we approve the campaign for production.",
  },
  {
    q: "What if the postcard doesn't fill?",
    a: "If the campaign isn't fully reserved by its deadline, your reservation is canceled and you aren't charged anything.",
  },
  {
    q: "What happens after I reserve?",
    a: "You get a confirmation email with a private link to your reservation. We review your artwork, and you can follow the campaign's progress on that page.",
  },
  {
    q: "How does mailing verification work?",
    a: "Your private Verified Mail page shows each stage of the campaign. When the mailing has been submitted, we add the mailing documentation for your edition so you can see it for yourself.",
  },
  {
    q: "Can I change my artwork?",
    a: "Yes. Before you reserve, you can replace or adjust your image as often as you like. After reserving, contact us and we'll help with changes before the artwork deadline.",
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
            <Eyebrow>Central Westchester · Shared postcard</Eyebrow>
            <h1 className="mt-4 font-display text-[2.6rem] font-medium leading-[1.05] tracking-tight sm:text-6xl">
              Your Business.
              <br />
              5,000 Local Mailboxes.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Reach homeowners across Central Westchester with one professionally printed shared postcard. Choose your
              advertising space, upload your artwork, and reserve without paying upfront.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/areas" size="lg">
                View Available Spaces
              </ButtonLink>
              <ButtonLink href="#how-it-works" size="lg" variant="secondary">
                How It Works
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-muted">Standard space $500 · Double space $900 · $0 today</p>
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
              title="Simple, fixed prices."
              intro="One price per space, the same for every advertiser. Nothing is charged until the campaign is confirmed."
            />
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <PriceCard
                name="Standard Advertisement"
                price="$500"
                detail="One space on the postcard. Great for an offer, a logo, and your phone number."
                diagram={<SizeDiagram size="standard" />}
              />
              <PriceCard
                name="Double-Size Advertisement"
                price="$900"
                detail="Two side-by-side spaces merged into one wide ad. Twice the room for $100 less than two spaces."
                diagram={<SizeDiagram size="double" />}
                highlight
              />
            </div>
            <p className="mt-6 text-sm text-muted">
              Mailed to approximately 5,000 homes in Central Westchester (planned quantity). Printed on a 6.5″ × 12″ card.
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
              intro="Direct mail usually asks you to take it on faith. With Verified Mail, every advertiser gets a private page that shows where their campaign stands."
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
              <h2 className="font-display text-3xl font-medium">Ready to see the open spaces?</h2>
              <p className="mt-2 text-background/75">Pick your spot on the first Central Westchester postcard.</p>
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
