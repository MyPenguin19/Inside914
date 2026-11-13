import Link from "next/link";
import { Suspense } from "react";
import { HeaderCta } from "@/components/header-cta";
import { BrandMark } from "@/components/brand-mark";

import { MARKETING_NAV } from "@/lib/marketing-content";

export function Logo() {
  return (
    <Link href="/" aria-label="Inside 914 home" className="inline-flex min-h-11 shrink-0 items-center text-2xl">
      <BrandMark />
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/90 backdrop-blur">
      <div className="page-width flex flex-wrap items-center justify-between gap-4 py-3">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-5 text-sm text-muted lg:flex">
          {MARKETING_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          {/* Reads the URL, so it streams in on dynamic routes instead of blocking prerendering. */}
          <Suspense fallback={null}>
            <HeaderCta />
          </Suspense>
          {/* Small screens: a simple disclosure menu, no JavaScript needed. */}
          <details className="relative lg:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-full border border-line px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
              Menu
            </summary>
            <nav aria-label="Main" className="absolute right-0 mt-2 flex w-60 max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-line bg-surface p-2 shadow-lg">
              {MARKETING_NAV.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-xl px-4 py-3 text-base hover:bg-background-soft">
                  {item.label}
                </Link>
              ))}
              <Link href="/areas" className="mt-1 rounded-xl bg-foreground px-4 py-3 text-center text-base font-medium text-background">
                Explore Areas
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
