"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { ContactFormState } from "@/app/(public)/actions/checkout";
import { BookingSteps } from "@/components/booking/booking-steps";
import { ContactForm } from "@/components/checkout/contact-form";
import { ReservationSummary } from "@/components/checkout/reservation-summary";
import { demoReservationView } from "@/components/demo/demo-ad-view";
import { useDemoStore } from "@/components/demo/demo-store";
import { NeedSelection } from "@/components/demo/need-selection";
import { parseContact } from "@/lib/checkout/contact";

// Real form and real validation rules; the details stay in this browser tab.
export default function DemoCheckoutPage() {
  const router = useRouter();
  const { selection, artwork, contact, setContact } = useDemoStore();
  const goToPayment = useCallback(() => router.push("/demo/payment"), [router]);

  if (!selection) return <NeedSelection />;

  async function action(_state: ContactFormState, form: FormData): Promise<ContactFormState> {
    const values = Object.fromEntries(
      ["businessName", "contactName", "email", "phone", "website", "category"].map((k) => [k, String(form.get(k) ?? "")]),
    );
    const parsed = parseContact(values);
    if (!parsed.ok) return { values, errors: parsed.errors };
    const c = parsed.contact;
    setContact({ businessName: c.businessName, contactName: c.contactName, email: c.email, phone: c.phone, website: c.website ?? "" });
    return { values, done: true };
  }

  return (
    <div>
      <BookingSteps current={5} />
      <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <section aria-labelledby="details-title">
          <h1 id="details-title" className="font-display text-4xl font-medium tracking-tight">
            Your business details
          </h1>
          <p className="mt-2 text-muted">So we know who the ad is for and where to send your confirmation.</p>
          <div className="mt-6">
            <ContactForm
              action={action}
              onDone={goToPayment}
              submitLabel="Continue"
              initial={{
                businessName: contact?.businessName ?? "",
                contactName: contact?.contactName ?? "",
                email: contact?.email ?? "",
                phone: contact?.phone ?? "",
                website: contact?.website ?? "",
                category: "",
              }}
            />
          </div>
        </section>
        <aside>
          <ReservationSummary view={demoReservationView(selection, artwork, contact)} amountLabel="Amount you'll authorize" />
        </aside>
      </div>
    </div>
  );
}
