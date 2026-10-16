import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-foreground">
          Inside<span className="text-accent">914</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-5 text-sm text-muted">
          <Link href="/#verified-mail" className="hover:text-foreground">
            Verified Mail
          </Link>
          <Link
            href="/#editions"
            className="rounded-full border border-foreground px-4 py-1.5 font-medium text-foreground hover:bg-foreground hover:text-background"
          >
            Book a spot
          </Link>
        </nav>
      </div>
    </header>
  );
}
