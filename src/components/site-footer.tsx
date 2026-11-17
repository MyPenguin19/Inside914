import Link from "next/link";
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "@/lib/support";
import { REGIONS } from "@/lib/catalog/regions";
import { MARKETING_NAV } from "@/lib/marketing-content";
import { Logo } from "@/components/site-header";
import { POLICY_LINKS } from "@/lib/legal/public-policies";

type FooterLink = { href: string; label: string };

function FooterLinks({ links }: { links: readonly FooterLink[] }) {
  return (
    <ul className="text-sm text-muted">
      {links.map(link => <li key={link.href}><Link href={link.href} className="footer-link">{link.label}</Link></li>)}
    </ul>
  );
}

function FooterSection({ title, label, links }: { title: string; label: string; links: readonly FooterLink[] }) {
  return (
    <nav aria-label={label}>
      {/* Native disclosures work without JavaScript. Only one layout is visible at each breakpoint. */}
      <details className="group border-b border-line md:hidden">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden">
          <h2 className="text-sm font-semibold">{title}</h2>
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4 shrink-0 text-muted group-open:rotate-180">
            <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <div className="pb-4"><FooterLinks links={links} /></div>
      </details>
      <div className="hidden md:block">
        <h2 className="mb-3 text-sm font-semibold">{title}</h2>
        <FooterLinks links={links} />
      </div>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-background-soft">
      <div className="page-width py-8 md:py-10">
        <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[1.3fr_3fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
              Local businesses. Westchester mailboxes.
            </p>
            <div className="mt-3 flex max-w-sm flex-wrap gap-x-5 text-sm text-muted">
              <Link href="/contact" className="footer-link font-medium text-foreground">Contact us</Link>
              <a href={SUPPORT_PHONE_HREF} className="footer-link">{SUPPORT_PHONE}</a>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="footer-link">{SUPPORT_EMAIL}</a>
            </div>
          </div>
          <div className="grid border-t border-line md:grid-cols-3 md:gap-x-8 md:border-t-0">
            <FooterSection
              title="Explore"
              label="Explore Inside914"
              links={[
                { href: "/about", label: "About Inside914" },
                ...MARKETING_NAV.filter(item => item.href !== "/contact" && item.href !== "/areas"),
              ]}
            />
            <FooterSection
              title="Advertising areas"
              label="Regional advertising"
              links={[
                { href: "/areas", label: "All advertising areas" },
                ...REGIONS.map(area => ({ href: `/areas/${area.slug}`, label: area.name })),
              ]}
            />
            <FooterSection
              title="Policies"
              label="Policies"
              links={POLICY_LINKS.map(item => ({ href: `/legal/${item.slug}`, label: item.label }))}
            />
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2 text-xs leading-relaxed text-muted md:mt-8 md:flex-row md:justify-between md:border-t md:border-line md:pt-5">
          <p>© Inside914.</p>
          <p>Inside914 is operated by Inside Diagnostics LLC.</p>
        </div>
      </div>
    </footer>
  );
}
