import { ErrorState } from "@/components/error-state";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Page not found", robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="page-width flex-1">
        <ErrorState title="Page not found" body={<p>This page doesn&apos;t exist or has moved.</p>}>
          <ButtonLink href="/areas">See advertising areas</ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Go to the homepage
          </ButtonLink>
        </ErrorState>
      </main>
      <SiteFooter />
    </>
  );
}
