"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const ADMIN_NAV = [
  { href: "/admin", label: "Home" },
  { href: "/admin/campaigns", label: "Campaigns" },
  { href: "/admin/advertisers", label: "Advertisers" },
  { href: "/admin/artwork", label: "Review artwork" },
  { href: "/admin/payments", label: "Payments" },
];

const isActive = (pathname: string, href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

// Desktop: vertical list in the sidebar. Phones: one scrollable row.
export function AdminNav() {
  const pathname = usePathname();
  const item = (href: string, label: string, extra = "") => (
    <li key={href}>
      <Link
        href={href}
        aria-current={isActive(pathname, href) ? "page" : undefined}
        className={`block min-h-11 whitespace-nowrap rounded-lg px-3 py-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          isActive(pathname, href) ? "bg-foreground text-background" : "text-muted hover:bg-background-soft hover:text-foreground"
        } ${extra}`}
      >
        {label}
      </Link>
    </li>
  );
  return (
    <nav aria-label="Admin">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col">
        {ADMIN_NAV.map((n) => item(n.href, n.label))}
        <li aria-hidden="true" className="hidden lg:my-2 lg:block lg:border-t lg:border-line" />
        {item("/admin/zones", "Advertising areas", "lg:text-xs")}
        {item("/admin/settings", "Settings", "lg:text-xs")}
      </ul>
    </nav>
  );
}
