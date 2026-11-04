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
      <aside className="sticky top-0 z-40 border-b border-line bg-surface lg:z-auto lg:h-screen lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex h-full items-center justify-between gap-3 px-4 py-3 lg:flex-col lg:items-stretch lg:justify-start lg:px-4 lg:py-6">
          <div className="min-w-0">
            <Logo />
            <p className="hidden text-xs text-muted lg:block">Your business workspace</p>
          </div>
          <div className="lg:mt-4">
            <AdminNav account={<>
              <p className="truncate text-xs text-muted">{user.email}</p>
              <form action={signOut} className="mt-1">
                <button type="submit" className="min-h-11 px-3 text-sm underline underline-offset-4">Sign out</button>
              </form>
            </>} />
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
