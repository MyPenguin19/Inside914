import Link from "next/link";
import { checkoutReleased, CHECKOUT_CLOSED_MESSAGE } from "@/lib/checkout/release";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  if (checkoutReleased()) return children;
  return <><SiteHeader /><main className="page-width flex-1 py-16">
    <h1 className="text-3xl font-semibold">Explore Inside914</h1>
    <p className="mt-4 max-w-xl">{CHECKOUT_CLOSED_MESSAGE}</p>
    <div className="mt-6 flex flex-wrap gap-6"><Link className="underline" href="/areas">View advertising areas</Link><Link className="underline" href="/reservation">View an existing reservation</Link></div>
  </main><SiteFooter /></>;
}
