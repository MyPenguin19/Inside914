import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="page-width flex-1 py-12">
        <section className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6">
          {children}
          <nav className="mt-6 flex flex-wrap gap-4 text-sm underline">
            <Link href="/account/login">Sign in</Link>
            <Link href="/account/signup">Create account</Link>
            <Link href="/account/forgot-password">Forgot password?</Link>
          </nav>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
