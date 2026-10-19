"use client";

import { useEffect } from "react";
import { ErrorState, errorReference } from "@/components/error-state";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button, ButtonLink } from "@/components/ui/button";

// Any page that throws while rendering lands here instead of Next's bare fallback.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void; reset: () => void }) {
  const reference = errorReference(error);
  useEffect(() => {
    console.error("page error", reference ?? "client"); // the reference only: never customer data
  }, [reference]);

  return (
    <>
      <SiteHeader />
      <main className="page-width flex-1">
        <ErrorState
          title="Something went wrong"
          reference={reference}
          body={
            <p>
              This page couldn&apos;t load. Nothing has been charged, and a position you&apos;re holding stays held until its timer runs out.
            </p>
          }
        >
          <Button onClick={() => retry()}>Try again</Button>
          <ButtonLink href="/" variant="secondary">
            Go to the homepage
          </ButtonLink>
        </ErrorState>
      </main>
      <SiteFooter />
    </>
  );
}
