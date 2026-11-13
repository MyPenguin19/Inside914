import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { LegalDocument, legalDocuments, LEGAL_VERSION } from "@/components/legal-document";
import { RESERVATION_POLICY } from "@/lib/legal/release";
import { MarketingBreadcrumb } from "@/components/marketing/page-seo";
import Link from "next/link";
import { POLICY_LINKS, POLICY_SUMMARIES } from "@/lib/legal/public-policies";

// Keep policy pages accessible without changing the existing marketing SEO scope.
export async function generateMetadata({ params }: PageProps<"/legal/[doc]">): Promise<Metadata> {
  const { doc } = await params;
  const policy = POLICY_LINKS.find(item => item.slug === doc);
  if (!policy) return { robots: { index: false, follow: false } };
  return { title: policy.title, description: policy.description, robots: { index: false, follow: true }, alternates: { canonical: `/legal/${doc}` } };
}
export function generateStaticParams() {
  return POLICY_LINKS.map(({ slug: doc }) => ({ doc }));
}

export default function LegalPage({ params }: PageProps<"/legal/[doc]">) {
  return <>
    <SiteHeader />
    <main id="main-content" tabIndex={-1} className="page-width flex-1 py-10 sm:py-14">
      <div className="mx-auto max-w-3xl">
      <MarketingBreadcrumb label="Policies" />
      <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-2xl bg-surface" />}>
        <LegalDoc params={params} />
      </Suspense>
      </div>
    </main>
    <SiteFooter />
  </>;
}

async function LegalDoc({ params }: { params: PageProps<"/legal/[doc]">["params"] }) {
  const { doc } = await params;
  const isSummary = Object.hasOwn(POLICY_SUMMARIES, doc);
  if (!isSummary && !Object.hasOwn(legalDocuments, doc)) notFound();
  return <>
    <p className="rounded-xl border border-line bg-background-soft px-5 py-4 text-sm text-muted">
      {isSummary ? <>Updated <time dateTime="2026-11-12">November 12, 2026</time> · Plain-language guide</> : <><strong className="text-foreground">Effective date: <time dateTime={RESERVATION_POLICY.effectiveDate}>November 2, 2026</time>.</strong>{" "}Version {LEGAL_VERSION}.</>}
    </p>
    {doc === "privacy" && <p className="mt-6 rounded-lg border border-line px-4 py-3 text-sm text-muted">
      <strong className="text-foreground">Website analytics notice — October 25, 2026.</strong>{" "}
      Our public marketing pages use Google Analytics to understand website visits. Analytics is disabled on administrator,
      checkout and private reservation pages. Google advertising features are disabled.
    </p>}
    <LegalDocument document={isSummary ? POLICY_SUMMARIES[doc] : legalDocuments[doc as keyof typeof legalDocuments]} />
    {isSummary && <p className="mt-8 rounded-xl border border-line bg-surface p-5 leading-relaxed text-muted">
      Read the full <Link href="/legal/reservation-policy" className="underline underline-offset-4">reservation, cancellation and refund policy</Link> and <Link href="/legal/terms" className="underline underline-offset-4">advertising terms</Link> for the complete conditions. Your accepted agreement and reservation-specific amount remain the governing record.
    </p>}
    <nav aria-label="Related policies" className="mt-10 border-t border-line pt-6">
      <h2 className="font-semibold">Other policies</h2>
      <ul className="mt-3 flex flex-wrap gap-x-6">
        {POLICY_LINKS.filter(item => item.slug !== doc).map(item => <li key={item.slug}><Link href={`/legal/${item.slug}`} className="footer-link text-sm underline">{item.label}</Link></li>)}
      </ul>
    </nav>
  </>;
}
