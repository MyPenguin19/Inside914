import Link from "next/link";
import { Suspense } from "react";
import { HeaderCta } from "@/components/header-cta";

const NAV = [
  { href: "/dashboard", label: "Account" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/areas", label: "Advertising Areas" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#verified-mail", label: "Verified Mail" },
];

export function Logo() {
  return (
    <Link href="/" className="font-display text-xl font-semibold tracking-tight text-foreground">
      Inside<span className="text-accent">914</span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/90 backdrop-blur">
      <div className="page-width flex items-center justify-between gap-4 py-3">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-7 text-sm text-muted lg:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {/* Reads the URL, so it streams in on dynamic routes instead of blocking prerendering. */}
          <Suspense fallback={null}>
            <HeaderCta />
          </Suspense>
          {/* Small screens: a simple disclosure menu, no JavaScript needed. */}
          <details className="relative lg:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-full border border-line px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
              Menu
            </summary>
            <nav aria-label="Main" className="absolute right-0 mt-2 flex w-60 flex-col rounded-2xl border border-line bg-surface p-2 shadow-lg">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-xl px-4 py-3 text-base hover:bg-background-soft">
                  {item.label}
                </Link>
              ))}
              <Link href="/areas" className="mt-1 rounded-xl bg-foreground px-4 py-3 text-center text-base font-medium text-background">
                Reserve Your Spot
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
