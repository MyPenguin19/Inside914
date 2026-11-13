import Link from "next/link";
import { Suspense } from "react";
import { HeaderCta } from "@/components/header-cta";
import { BrandMark } from "@/components/brand-mark";
import { ActiveSiteNavigation, SiteNavigation } from "@/components/site-navigation";

export function Logo() {
  return (
    <Link href="/" aria-label="Inside 914 home" className="inline-flex min-h-11 shrink-0 items-center text-2xl">
      <BrandMark />
    </Link>
  );
}

export function SiteHeader() {
  return (
    <>
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <header className="relative top-0 z-40 border-b border-line bg-background lg:sticky">
      <div className="page-width flex flex-wrap items-center justify-between gap-4 py-3">
        <Logo />
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-4">
          <Suspense fallback={<SiteNavigation />}><ActiveSiteNavigation /></Suspense>
          {/* Reads the URL, so it streams in on dynamic routes instead of blocking prerendering. */}
          <Suspense fallback={null}>
            <HeaderCta />
          </Suspense>
        </div>
      </div>
    </header>
    </>
  );
}
