import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ButtonLink } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/primitives";
import { MARKETING_NAV } from "@/lib/marketing-content";
import { MarketingBreadcrumb } from "./page-seo";

export function MarketingPage({ path, title, intro, children }: {
  path: (typeof MARKETING_NAV)[number]["href"] | "/about"; title: string; intro: string; children: ReactNode;
}) {
  const label = path === "/about" ? "About" : MARKETING_NAV.find(item => item.href === path)!.label;
  return <>
    <SiteHeader />
    <main id="main-content" tabIndex={-1} className="page-width min-w-0 flex-1 break-words py-10 sm:py-14">
      <MarketingBreadcrumb label={label} />
      <div className="border-b border-line pb-8 sm:pb-10">
        <Eyebrow>{label} · Westchester County</Eyebrow>
        <h1 className="mt-3 max-w-3xl text-balance font-display text-4xl font-medium leading-tight tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted">{intro}</p>
      </div>
      {children}
      <Card tone="dark" className="mt-12 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div className="min-w-0 max-w-full"><h2 className="font-display text-3xl font-medium">Find your Westchester area.</h2><p className="mt-2 text-background/75">Review available campaigns, positions and prices.</p></div>
        <ButtonLink href="/areas" variant="inverse" className="max-w-full text-center">Explore Advertising Areas</ButtonLink>
      </Card>
    </main>
    <SiteFooter />
  </>;
}
