import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { LegalDocument, legalDocuments, LEGAL_VERSION } from "@/components/legal-document";

// Draft policies are public for review, not eligible for search indexing until legally approved.
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
        <strong className="text-foreground">Proposed policy pending owner and qualified legal-counsel review.</strong>{" "}
        Version {LEGAL_VERSION}. Effective date: Pending approval.
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
  return <LegalDocument document={legalDocuments[doc as keyof typeof legalDocuments]} />;
}
