import { Suspense } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { signOut } from "@/app/account/actions";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="page-width flex-1 py-8">
        <nav className="mb-6 flex flex-wrap gap-5 text-sm">
          <Link href="/dashboard" className="underline">
            My reservations
          </Link>
          <Link href="/book/multi" className="underline">
            Reserve more areas
          </Link>
          <Link href="/dashboard/recurring" className="underline">
            Recurring advertisements
          </Link>
          <form action={signOut}>
            <button className="underline">Sign out</button>
          </form>
        </nav>
        <Suspense fallback={<p>Loading your account…</p>}>{children}</Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
