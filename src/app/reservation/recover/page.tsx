import { ReservationAccess } from "@/components/checkout/reservation-access";
export const maxDuration=60;
export const metadata={title:"Recover reservation · Inside914",robots:{index:false,follow:false},referrer:"no-referrer" as const};
export default function Page(){return <main className="page-width max-w-xl py-12"><ReservationAccess recovery/></main>;}
