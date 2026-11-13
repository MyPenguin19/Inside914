import Link from "next/link";
import { pageStructuredData } from "@/lib/structured-data";
import { MARKETING_PAGES } from "@/lib/marketing-content";

export function MarketingPageSeo({ path, ...options }: { path: keyof typeof MARKETING_PAGES } & NonNullable<Parameters<typeof pageStructuredData>[3]>) {
  const { title, description } = MARKETING_PAGES[path];
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageStructuredData(path, title, description, options)).replace(/</g, "\\u003c") }} />;
}

export function MarketingBreadcrumb({ label }: { label: string }) {
  return <nav aria-label="Breadcrumb" className="mb-8 text-sm text-muted">
    <ol className="flex flex-wrap gap-2">
      <li><Link href="/" className="underline underline-offset-4 hover:text-foreground">Home</Link></li>
      <li aria-current="page"><span aria-hidden="true">/ </span>{label}</li>
    </ol>
  </nav>;
}
