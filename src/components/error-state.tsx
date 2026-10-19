import type { ReactNode } from "react";
import { SUPPORT_EMAIL } from "@/lib/support";

// Shared body of the error and not-found pages: a calm message, optional support reference and
// actions. Never shows internal error details.
export function ErrorState({ title, body, reference, children }: { title: string; body: ReactNode; reference?: string; children?: ReactNode }) {
  return (
    <section aria-labelledby="error-title" className="mx-auto flex w-full max-w-xl flex-col items-center py-16 text-center sm:py-24">
      <h1 id="error-title" className="font-display text-4xl font-medium tracking-tight">
        {title}
      </h1>
      <div className="mt-4 text-muted">{body}</div>
      {children && <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{children}</div>}
      <p className="mt-8 text-sm text-muted">
        Need help? Email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-foreground underline-offset-4 hover:underline">
          {SUPPORT_EMAIL}
        </a>
        {reference && (
          <>
            {" "}
            and mention reference <span className="font-mono text-foreground">{reference}</span>
          </>
        )}
        .
      </p>
    </section>
  );
}

// The digest Next.js attaches to server errors: safe to show, and it matches the server logs.
export function errorReference(error: unknown) {
  return error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : undefined;
}
