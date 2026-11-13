import { customerMailing } from "@/lib/mailing/customer";
import { CUSTOMER_PAYMENT_LABELS } from "@/lib/mailing/timeline";
import { MailingProgress } from "@/components/checkout/mailing-progress";
import Link from "next/link";
import { ReservationRequests } from "@/components/checkout/reservation-requests";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { Panel } from "@/components/booking/hold-state-panel";
import { ReservationSummary } from "@/components/checkout/reservation-summary";
import { TestReservationBanner } from "@/components/checkout/test-reservation-banner";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ACCESS_COOKIE, resolveAccessToken } from "@/lib/access/tokens";
import { getReservationView } from "@/lib/checkout/reservation";
import { getEmailEnv } from "@/lib/env/checkout";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Your reservation · Inside914", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default function ReservationPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-line bg-surface" />}>
          <Reservation />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Reservation() {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value; // first: marks the page dynamic before any env access
  const admin = createAdminClient();
  const bookingId = await resolveAccessToken(admin, token).catch(() => null);
  const view = bookingId ? await getReservationView(admin, bookingId).catch(() => null) : null;
  if (!view || !view.reference) {
    return (
      <Panel title="This link isn't valid">
        <p className="text-muted">
          Reservation links are private and can expire or be replaced. Please use the newest link from your confirmation
          email, <Link href="/reservation/recover" className="underline">request another private link</Link>, or contact us at {getEmailEnv().supportEmail}.
        </p>
      </Panel>
    );
  }
  const mailing=await customerMailing(admin,view).catch(()=>null);
  const edition=await admin.from("editions").select("status,artwork_due_at,artwork_deadline").eq("id",view.editionId).single();
  const requests=await admin.from("customer_requests").select("id,kind,status,response").eq("booking_id",view.bookingId).order("created_at",{ascending:false});
  // Request-scoped server time after cookies() has made this page dynamic.
  // eslint-disable-next-line react-hooks/purity
  const locked=!edition.data || !["open","closed"].includes(edition.data.status) || Date.parse(edition.data.artwork_due_at??edition.data.artwork_deadline)<=Date.now();
  return (
    <div className="flex flex-col gap-6">
      {view.isTest && <TestReservationBanner />}
      <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Reservation {view.reference}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{view.businessName}</h1>
        <p className="mt-3 font-medium">{view.isTest ? "TEST reservation: nothing saved or authorized." : `${view.status==="cancelled"?"Reservation canceled.":"Reservation confirmed."} ${mailing?(CUSTOMER_PAYMENT_LABELS[mailing.paymentStatus]??"Payment status awaiting confirmation."):"Payment status temporarily unavailable."}`}</p>
      </section>
      {view.status!=="cancelled"&&<ReservationRequests artworkLocked={locked}/>}
      {!!requests.data?.length&&<section className="rounded-2xl border border-line p-5"><h2 className="font-semibold">Your requests</h2>{requests.data.map(r=><p className="mt-3" key={r.id}>{r.kind.replaceAll("_"," ")} · {r.status}{r.response?` — ${r.response}`:""}</p>)}</section>}
      <ReservationSummary view={view} amountLabel="Agreed amount" showReservationTerms={false} />
      {mailing?<MailingProgress data={mailing}/>:<p role="status">Campaign progress is temporarily unavailable. Please try again later.</p>}
    </div>
  );
}
