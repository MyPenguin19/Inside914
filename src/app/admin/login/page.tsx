import { Suspense } from "react";
import { Logo } from "@/components/site-header";
import { Card } from "@/components/ui/primitives";
import { LoginForm } from "./login-form";

export const metadata = { title: "Admin sign in · Inside914", robots: { index: false, follow: false } };

const NOTICES: Record<string, string> = {
  not_admin: "That account doesn't have admin access.",
};

export default function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-background-soft px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Logo />
          <p className="mt-1 text-sm text-muted">Admin</p>
        </div>
        <Card>
          <h1 className="font-display text-2xl font-medium tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted">For the Inside914 team only.</p>
          <div className="mt-6">
            <Suspense fallback={<LoginForm />}>
              <FormWithNotice searchParams={searchParams} />
            </Suspense>
          </div>
        </Card>
      </div>
    </main>
  );
}

async function FormWithNotice({ searchParams }: { searchParams: PageProps<"/admin/login">["searchParams"] }) {
  const { error } = await searchParams;
  return <LoginForm notice={typeof error === "string" ? NOTICES[error] : undefined} />;
}
