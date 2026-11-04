import { Suspense } from "react";
import { signOut } from "@/app/admin/actions";
import { AdminNav } from "@/components/admin/admin-nav";
import { Logo } from "@/components/site-header";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata = { title: "Admin · Inside914", robots: { index: false, follow: false } };

// The shell renders only after the server confirms an admin session. Pages check again themselves.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" aria-busy="true" />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return (
    <div className="flex min-h-screen flex-1 flex-col lg:flex-row">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col gap-3 px-4 py-3 lg:px-4 lg:py-6">
          <div className="flex items-center justify-between gap-3 lg:block">
            <div>
              <Logo />
              <p className="text-xs text-muted">Your business workspace</p>
            </div>
            <form action={signOut} className="lg:hidden">
              <button type="submit" className="min-h-11 rounded-full border border-line px-4 text-sm hover:border-foreground">
                Sign out
              </button>
            </form>
          </div>
          <div className="lg:mt-4">
            <AdminNav />
          </div>
          <div className="mt-auto hidden border-t border-line pt-4 lg:block">
            <p className="truncate text-xs text-muted" title={user.email ?? undefined}>
              {user.email}
            </p>
            <form action={signOut} className="mt-2">
              <button type="submit" className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-6xl">{children}</div></main>
    </div>
  );
}
