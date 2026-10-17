import Link from "next/link";
import { DemoStoreProvider } from "@/components/demo/demo-store";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "Design preview · Inside914", robots: { index: false, follow: false } };

// Every page under /demo is a DESIGN PREVIEW: sample data, no server calls, nothing saved.
export default function DemoLayout({ children }: LayoutProps<"/demo">) {
  return (
    <>
      <div role="note" className="bg-warning-soft text-warning">
        <p className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-xs font-medium sm:px-6 sm:text-sm">
          <span>
            <strong>Design preview.</strong> Sample data only: no real reservations, payments or emails.
          </span>
          <Link href="/demo" className="underline underline-offset-2">
            All preview screens
          </Link>
        </p>
      </div>
      <SiteHeader />
      <DemoStoreProvider>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      </DemoStoreProvider>
      <SiteFooter />
    </>
  );
}
