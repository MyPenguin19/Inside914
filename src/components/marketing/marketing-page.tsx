import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ButtonLink } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/primitives";
import { MARKETING_NAV } from "@/lib/marketing-content";
import { MarketingBreadcrumb } from "./page-seo";
import Link from "next/link";

export function MarketingPage({ path, title, intro, children }: {
  path: (typeof MARKETING_NAV)[number]["href"]; title: string; intro: string; children: ReactNode;
}) {
  const label = MARKETING_NAV.find(item => item.href === path)!.label;
  return <>
    <SiteHeader />
    <main className="page-width min-w-0 flex-1 break-words py-10 sm:py-14">
      <MarketingBreadcrumb label={label} />
      <div className="max-w-3xl">
        <Eyebrow>{label} · Westchester County</Eyebrow>
        <h1 className="mt-3 font-display text-4xl font-medium tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">{intro}</p>
      </div>
      {children}
      <Card tone="dark" className="mt-12 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div className="min-w-0 max-w-full"><h2 className="font-display text-3xl font-medium">Find your Westchester area.</h2><p className="mt-2 text-background/75">Review available campaigns, positions and prices.</p></div>
        <ButtonLink href="/areas" variant="inverse" className="max-w-full text-center">Explore Advertising Areas</ButtonLink>
      </Card>
      <nav aria-label="More about advertising" className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm">
        {MARKETING_NAV.filter(item => item.href !== path).map(item => <Link key={item.href} href={item.href} className="underline underline-offset-4 hover:text-accent">{item.label}</Link>)}
      </nav>
    </main>
    <SiteFooter />
  </>;
}
