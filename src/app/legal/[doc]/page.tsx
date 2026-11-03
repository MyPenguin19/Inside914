import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { LegalDocument, legalDocuments, LEGAL_VERSION } from "@/components/legal-document";
import { RESERVATION_POLICY } from "@/lib/legal/release";

// Keep policy pages accessible without changing the existing marketing SEO scope.
export async function generateMetadata({ params }: PageProps<"/legal/[doc]">): Promise<Metadata> {
  const { doc } = await params;
  const titles: Record<string, string> = {
    terms: "Advertising Terms",
    "reservation-policy": "Reservation and Cancellation Policy",
    privacy: "Privacy Policy",
  };
  if (!Object.hasOwn(titles, doc)) return { robots: { index: false, follow: false } };
  return { title: titles[doc], robots: { index: false, follow: true }, alternates: { canonical: `/legal/${doc}` } };
}
export function generateStaticParams() {
  return Object.keys(legalDocuments).map((doc) => ({ doc }));
}

export default function LegalPage({ params }: PageProps<"/legal/[doc]">) {
  return <>
    <SiteHeader />
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-muted">
        <strong className="text-foreground">Effective date: <time dateTime={RESERVATION_POLICY.effectiveDate}>November 2, 2026</time>.</strong>{" "}
        Version {LEGAL_VERSION}.
      </p>
      <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-2xl bg-surface" />}>
        <LegalDoc params={params} />
      </Suspense>
    </main>
    <SiteFooter />
  </>;
}

async function LegalDoc({ params }: { params: PageProps<"/legal/[doc]">["params"] }) {
  const { doc } = await params;
  if (!Object.hasOwn(legalDocuments, doc)) notFound();
  return <>
    {doc === "privacy" && <p className="mt-6 rounded-lg border border-line px-4 py-3 text-sm text-muted">
      <strong className="text-foreground">Website analytics notice — October 25, 2026.</strong>{" "}
      Our public marketing pages use Google Analytics to understand website visits. Analytics is disabled on administrator,
      checkout and private reservation pages. Google advertising features are disabled.
    </p>}
    <LegalDocument document={legalDocuments[doc as keyof typeof legalDocuments]} />
  </>;
}
