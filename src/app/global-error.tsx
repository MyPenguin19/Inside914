"use client";

import { useEffect } from "react";
import { ErrorState, errorReference } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import "./globals.css";

// Last resort when the root layout itself fails: replaces the whole document, so it brings its own
// <html>, <body> and styles (no site header, which could be what failed).
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void; reset: () => void }) {
  const reference = errorReference(error);
  useEffect(() => {
    console.error("root error", reference ?? "client");
  }, [reference]);

  return (
    <html lang="en">
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        <title>Something went wrong · Inside914</title>
        <main className="page-width">
          <ErrorState
            title="Something went wrong"
            reference={reference}
            body={<p>Inside914 couldn&apos;t load. Nothing has been charged.</p>}
          >
            <Button onClick={() => retry()}>Try again</Button>
            {/* A full page load on purpose: client navigation runs through the layout that failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="font-medium underline-offset-4 hover:underline">
              Go to the homepage
            </a>
          </ErrorState>
        </main>
      </body>
    </html>
  );
}
