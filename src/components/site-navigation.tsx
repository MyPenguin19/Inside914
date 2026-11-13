"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { MARKETING_NAV } from "@/lib/marketing-content";

function CurrentPath({ onChange }: { onChange: (pathname: string) => void }) {
  const pathname = usePathname();
  useEffect(() => onChange(pathname), [pathname, onChange]);
  return null;
}

// Only the route observer may suspend. Keep the native disclosure and links
// mounted so a streamed update cannot close an open menu or discard its focus.
export function SiteNavigation() {
  const [pathname, setPathname] = useState("");
  const menu = useRef<HTMLDetailsElement>(null);
  const current = (href: string) => pathname === href || (href === "/areas" && pathname.startsWith("/areas/"));
  const links = MARKETING_NAV.map(item => <Link key={item.href} href={item.href}
    aria-current={pathname === item.href ? "page" : current(item.href) ? "location" : undefined}
    className="site-nav-link" onClick={() => menu.current?.removeAttribute("open")}>
    {item.label}
  </Link>);

  return <>
    <Suspense fallback={null}><CurrentPath onChange={setPathname} /></Suspense>
    <nav aria-label="Main" className="hidden flex-wrap items-center gap-1 text-sm lg:flex">{links}</nav>
    <details ref={menu} className="relative lg:hidden"
      onKeyDown={event => {
        if (event.key === "Escape" && menu.current?.open) {
          event.preventDefault();
          menu.current.open = false;
          menu.current.querySelector("summary")?.focus();
        }
      }}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) menu.current?.removeAttribute("open");
      }}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border border-control-line px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        Menu
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 5h10M3 8h10M3 11h10" /></svg>
      </summary>
      <nav aria-label="Main" className="absolute right-0 z-50 mt-3 flex max-h-[min(70dvh,32rem)] w-64 max-w-[calc(100vw-2rem)] flex-col gap-1 overflow-y-auto rounded-2xl border border-line bg-surface p-3 shadow-lg">
        {links}
        <Link href="/areas" onClick={() => menu.current?.removeAttribute("open")} className="mt-2 rounded-xl bg-foreground px-4 py-3 text-center text-base font-medium text-background">Explore Areas</Link>
      </nav>
    </details>
  </>;
}
