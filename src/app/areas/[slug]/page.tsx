import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { REGIONS, findRegion } from "@/lib/catalog/regions";
import { SITE_NAME } from "@/lib/seo";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const AREA_COPY = {
  "central-westchester": {
    intro: "Explore shared postcard advertising in Central Westchester. This area guide helps businesses compare local marketing opportunities without committing to an unconfirmed mailing route.",
    audience: "Restaurants, shops, neighborhood services and established local companies can use a shared postcard to introduce an offer or keep their business top of mind.",
  },
  "southern-westchester": {
    intro: "Explore shared direct-mail advertising for Southern Westchester businesses. Inside914 organizes advertising by area so you can review a possible local postcard campaign before reserving a position.",
    audience: "A neighborhood-focused mailer may suit retail, food service, home services and other businesses that serve customers in southern Westchester communities.",
  },
  "northern-westchester": {
    intro: "Plan postcard advertising in Northern Westchester with Inside914. See how a shared mailer can bring multiple local businesses together on a single printed postcard.",
    audience: "Local professional services, home service providers and community businesses can explore this region and evaluate whether the proposed campaign fits their audience.",
  },
  "eastern-westchester": {
    intro: "Discover the Eastern Westchester advertising area on Inside914. Compare shared postcard opportunities and follow the confirmation process before a campaign is printed or mailed.",
    audience: "Independent businesses serving eastern Westchester can use a simple printed advertisement to explain their services, announce an offer or introduce themselves to nearby households.",
  },
} as const;

export function generateStaticParams() { return REGIONS.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: PageProps<"/areas/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const region = findRegion(slug);
  if (!region) return { robots: { index: false } };
  const title = `${region.name} Postcard Advertising | Inside914`;
  const description = `Explore shared postcard advertising in ${region.name}, NY. Learn how Inside914 works, compare Westchester mailing areas and view campaign availability.`;
  const url = `/areas/${region.slug}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url }, twitter: { card: "summary_large_image" } };
}

export default async function AreaLandingPage({ params }: PageProps<"/areas/[slug]">) {
  const { slug } = await params;
  const region = findRegion(slug);
  if (!region) notFound();
  const copy = AREA_COPY[region.slug];
  return <>
    <SiteHeader />
    <main className="page-width flex-1 py-10 sm:py-14">
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link className="underline hover:text-foreground" href="/">Home</Link> <span aria-hidden="true">/</span> <Link className="underline hover:text-foreground" href="/areas">Advertising areas</Link> <span aria-hidden="true">/</span> {region.name}</nav>
      <article className="mt-9 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Westchester County, New York</p>
        <h1 className="mt-3 font-display text-4xl font-medium tracking-tight sm:text-5xl">{region.name} Direct Mail Advertising</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">{copy.intro}</p>
        <h2 className="mt-10 font-display text-2xl font-medium">Reach local audiences with shared postcards</h2>
        <p className="mt-4 leading-relaxed text-muted">{copy.audience}</p>
        <p className="mt-4 leading-relaxed text-muted">Inside914's standard shared postcard has ten paid positions. Businesses select an area, a position and their artwork. No payment is collected when reserving; a future charge can only happen after the campaign fills and receives the required approvals. New reservations may currently be unavailable while launch preparations are completed.</p>
        <h2 className="mt-10 font-display text-2xl font-medium">Review the mailing area before committing</h2>
        <p className="mt-4 leading-relaxed text-muted">Area groupings are planning guides. Postal routes, final household quantities, mailing dates and printer specifications must be confirmed for the individual campaign. An area name is not a promise to deliver to every address in that region.</p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:bg-accent" href="/areas">Explore all advertising areas</Link>
          <Link className="rounded-full border border-line px-6 py-3 text-sm font-medium hover:bg-background-soft" href="/#how-it-works">How shared mail works</Link>
        </div>
        <h2 className="mt-12 font-display text-2xl font-medium">Other Westchester advertising areas</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {REGIONS.filter(item => item.slug !== region.slug).map(item => <li key={item.slug}><Link href={`/areas/${item.slug}`} className="underline decoration-line-strong underline-offset-4 hover:text-accent">{item.name}</Link></li>)}
        </ul>
        <p className="mt-9 text-sm text-muted">Questions? Contact <a className="underline" href="mailto:Info@inside914.com">Info@inside914.com</a>. Inside914 is operated by Inside Diagnostics LLC.</p>
      </article>
    </main>
    <SiteFooter />
  </>;
}
