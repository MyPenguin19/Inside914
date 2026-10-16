import { connection } from "next/server";
import { Suspense } from "react";
import { EditionCard } from "@/components/booking/edition-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { VerifiedMail } from "@/components/verified-mail";
import { getBookableEditions } from "@/lib/catalog/queries";

const HOW_IT_WORKS = [
  {
    title: "One shared, oversized postcard",
    body: "Local businesses split a single 6.5″ × 12″ postcard. Each business gets its own clearly marked position.",
  },
  {
    title: "Mailed to homes in your area",
    body: "Each edition goes to a defined Westchester neighborhood, so your ad reaches the people who live near you.",
  },
  {
    title: "Simple, fixed pricing",
    body: "Pick a standard position or a double-width spot. You see the price before you hold anything.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pb-12 pt-14 sm:px-6 sm:pt-20">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Westchester · 914</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Local advertising you can verify.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">
            Put your business on a shared postcard mailed to homes in your neighborhood. Choose your spot on the card,
            see your price up front, and follow your campaign with Inside914 Verified Mail.
          </p>
          <a
            href="#editions"
            className="mt-8 inline-block rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:bg-accent"
          >
            See open editions
          </a>
        </section>

        <section aria-labelledby="how-title" className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
          <h2 id="how-title" className="sr-only">
            How it works
          </h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {HOW_IT_WORKS.map((item, i) => (
              <li key={item.title} className="rounded-2xl border border-line p-5">
                <span className="text-sm font-semibold text-accent">{i + 1}</span>
                <h3 className="mt-2 font-medium">{item.title}</h3>
                <p className="mt-1 text-sm text-muted">{item.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="editions" aria-labelledby="editions-title" className="scroll-mt-20 border-y border-line bg-surface/60">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 id="editions-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Choose your mailing edition
            </h2>
            <p className="mt-2 text-muted">Step 1 of 4. Pick the area and month you want to reach.</p>
            <Suspense fallback={<EditionsSkeleton />}>
              <EditionList />
            </Suspense>
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <VerifiedMail />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function EditionList() {
  await connection();
  let editions;
  try {
    editions = await getBookableEditions();
  } catch (error) {
    console.error(error);
    return (
      <p role="alert" className="mt-6 rounded-xl border border-line bg-surface p-5 text-muted">
        We couldn&apos;t load the open editions right now. Please refresh the page in a moment.
      </p>
    );
  }
  if (!editions.length) {
    return (
      <p className="mt-6 rounded-xl border border-line bg-surface p-5 text-muted">
        No editions are open for booking right now. Check back soon.
      </p>
    );
  }
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {editions.map((edition) => (
        <EditionCard key={edition.id} edition={edition} />
      ))}
    </div>
  );
}

function EditionsSkeleton() {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading editions">
      <div className="h-64 animate-pulse rounded-2xl border border-line bg-surface" />
    </div>
  );
}
