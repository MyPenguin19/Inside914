import Link from "next/link";
import { Logo } from "@/components/site-header";

// Contact address matches the SUPPORT_EMAIL default; confirm before launch.
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-background-soft">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
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
              <a href="mailto:support@inside914.com" className="hover:text-foreground">
                support@inside914.com
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
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted sm:px-6">© Inside914. Local advertising you can verify.</p>
      </div>
    </footer>
  );
}
