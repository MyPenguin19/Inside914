import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TERMS_VERSION } from "@/lib/checkout/terms";

// DRAFT policy pages. Placeholders for review by a lawyer (including card-network rules for
// saved cards and future charges) before Inside914 accepts real payments.

const DOCS: Record<string, { title: string; sections: [string, string][] }> = {
  terms: {
    title: "Advertising terms",
    sections: [
      ["What you're reserving", "A position on a shared Inside914 postcard for the edition shown in your reservation."],
      ["Payment", "You save a card when you reserve. You are charged the amount shown in your reservation only if every space in the campaign is reserved and Inside914 approves the campaign for production. Nothing is charged when you reserve."],
      ["Your artwork", "You confirm you have the right to use your artwork and that it is accurate and lawful. Inside914 may decline artwork that is unsuitable for print or for a community mailer."],
    ],
  },
  "reservation-policy": {
    title: "Reservation and cancellation policy",
    sections: [
      ["Holds", "Choosing a position holds it for 15 minutes while you finish booking."],
      ["If the campaign doesn't fill", "If the campaign is not fully reserved by its stated deadline, your reservation is canceled and you are not charged."],
      ["Canceling", "Contact us before the campaign is approved for production to cancel. Detailed timing and refund terms will be added here after legal review."],
    ],
  },
  privacy: {
    title: "Privacy policy",
    sections: [
      ["What we collect", "Your business and contact details, your artwork, and a reference to the card saved with our payment processor, Stripe. Inside914 never receives or stores your card number."],
      ["How we use it", "To run your campaign, contact you about it, and charge the authorized amount if the campaign proceeds."],
      ["Sharing", "With our printer and service providers only as needed to produce and mail your campaign, and with Stripe to process payments."],
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export default async function LegalPage({ params }: PageProps<"/legal/[doc]">) {
  const { doc } = await params;
  const page = DOCS[doc];
  if (!page) notFound();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-muted">
          <strong className="text-foreground">Draft, pending legal review.</strong> Version {TERMS_VERSION}.
        </p>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">{page.title}</h1>
        {page.sections.map(([heading, body]) => (
          <section key={heading} className="mt-6">
            <h2 className="text-lg font-semibold">{heading}</h2>
            <p className="mt-2 text-muted">{body}</p>
          </section>
        ))}
      </main>
      <SiteFooter />
    </>
  );
}
