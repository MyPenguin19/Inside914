"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

export const ADMIN_NAV = [
  { href: "/admin", label: "Home" },
  { href: "/admin/campaigns", label: "Campaigns" },
  { href: "/admin/advertisers", label: "Advertisers" },
  { href: "/admin/artwork", label: "Review artwork" },
  { href: "/admin/payments", label: "Payments" },
];

const isActive = (pathname: string, href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

// The mobile disclosure exposes every destination without horizontal scrolling.
export function AdminNav({ account }: { account: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !nav.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  const item = (href: string, label: string, extra = "") => (
    <li key={href}>
      <Link
        href={href}
        onNavigate={() => setOpen(false)}
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
    <nav ref={nav} aria-label="Admin" onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        toggle.current?.focus();
      }
    }} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button ref={toggle} type="button" aria-expanded={open} aria-controls="admin-menu" onClick={() => setOpen(!open)}
        className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:hidden">
        {open ? "Close menu" : "Menu"}
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
          {open ? <path d="m5 5 10 10M15 5 5 15" /> : <path d="M3 5h14M3 10h14M3 15h14" />}
        </svg>
      </button>
      <div id="admin-menu" className={`${open ? "block" : "hidden"} absolute inset-x-0 top-full z-30 max-h-[calc(100dvh-5rem)] overflow-y-auto border-b border-line bg-surface px-4 pb-4 shadow-lg lg:static lg:block lg:max-h-none lg:overflow-visible lg:border-0 lg:p-0 lg:shadow-none`}>
        <ul className="flex flex-col gap-1">
          {ADMIN_NAV.map((n) => item(n.href, n.label))}
          <li aria-hidden="true" className="my-2 border-t border-line" />
          {item("/admin/zones", "Advertising areas", "lg:text-xs")}
          {item("/admin/settings", "Settings", "lg:text-xs")}
        </ul>
        <div className="mt-3 border-t border-line pt-3 lg:hidden">{account}</div>
      </div>
    </nav>
  );
}
