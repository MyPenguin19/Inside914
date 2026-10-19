import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/support";
import { Logo } from "@/components/site-header";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-background-soft">
      <div className="page-width grid gap-8 py-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
            Shared postcard advertising for local businesses in Westchester County, New York.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Contact</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-foreground">
                {SUPPORT_EMAIL}
              </a>
            </li>
            <li>Westchester County, NY</li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Policies</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link href="/legal/terms" className="hover:text-foreground">Advertising terms</Link></li>
            <li><Link href="/legal/reservation-policy" className="hover:text-foreground">Reservation policy</Link></li>
            <li><Link href="/legal/privacy" className="hover:text-foreground">Privacy policy</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="page-width py-4 text-xs text-muted">© Inside914. Local advertising you can verify.</p>
      </div>
    </footer>
  );
}
