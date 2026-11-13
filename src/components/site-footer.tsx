import Link from "next/link";
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "@/lib/support";
import { REGIONS } from "@/lib/catalog/regions";
import { MARKETING_NAV } from "@/lib/marketing-content";
import { Logo } from "@/components/site-header";
import { POLICY_LINKS } from "@/lib/legal/public-policies";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-background-soft">
      <div className="page-width grid gap-x-10 gap-y-8 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
            Shared postcard advertising for local businesses in Westchester County, New York.
            Inside914 is operated by Inside Diagnostics LLC.
          </p>
        </div>
        <nav aria-label="Explore Inside914">
          <h2 className="text-sm font-semibold">Explore</h2>
          <ul className="mt-3 text-sm text-muted">
            {MARKETING_NAV.filter(item => item.href !== "/contact").map(item => <li key={item.href}><Link href={item.href} className="footer-link">{item.label}</Link></li>)}
          </ul>
        </nav>
        <div>
          <h2 className="text-sm font-semibold">Contact</h2>
          <ul className="mt-3 text-sm text-muted">
            <li><Link href="/contact" className="footer-link">Contact us</Link></li>
            <li>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="footer-link">
                {SUPPORT_EMAIL}
              </a>
            </li>
            <li><a href={SUPPORT_PHONE_HREF} className="footer-link">{SUPPORT_PHONE}</a></li>
            <li className="pt-3">Westchester County, NY</li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Policies</h2>
          <ul className="mt-3 text-sm text-muted">
            {POLICY_LINKS.map(item => <li key={item.slug}><Link href={`/legal/${item.slug}`} className="footer-link">{item.label}</Link></li>)}
          </ul>
        </div>
      </div>
      <div className="page-width pb-6">
        <h2 className="text-sm font-semibold">Westchester advertising areas</h2>
        <nav aria-label="Regional advertising" className="mt-2 flex flex-wrap gap-x-6 text-sm text-muted">
          {REGIONS.map(area => <Link key={area.slug} href={`/areas/${area.slug}`} className="footer-link">{area.name}</Link>)}
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="page-width py-4 text-xs text-muted">© Inside914. Local businesses. Westchester mailboxes.</p>
      </div>
    </footer>
  );
}
