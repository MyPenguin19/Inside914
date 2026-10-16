const POINTS = [
  {
    title: "A private link for every campaign",
    body: "After you book, you get a verification link that only you can open. No account or password to remember.",
  },
  {
    title: "Progress you can follow",
    body: "See where your campaign stands as it moves through artwork review, printing and mailing.",
  },
  {
    title: "Documented mailing evidence",
    body: "When it becomes available, we add the mailing documentation for your edition to the same page.",
  },
];

export function VerifiedMail({ compact = false }: { compact?: boolean }) {
  return (
    <section id="verified-mail" aria-labelledby="verified-mail-title" className="scroll-mt-20">
      <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Inside914 Verified Mail</p>
        <h2 id="verified-mail-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Know your ad actually went out.
        </h2>
        <p className="mt-3 max-w-2xl text-muted">
          Direct mail usually asks you to take it on faith. With Verified Mail, every advertiser receives a private
          verification link to view campaign progress and documented mailing evidence when it&apos;s available.
        </p>
        {!compact && (
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {POINTS.map((point) => (
              <li key={point.title} className="rounded-xl border border-line p-4">
                <h3 className="font-medium">{point.title}</h3>
                <p className="mt-1 text-sm text-muted">{point.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
