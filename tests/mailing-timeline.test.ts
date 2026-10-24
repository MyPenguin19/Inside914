import { expect,test } from "vitest";
import { customerPaymentStatus,reservationTimeline } from "@/lib/mailing/timeline";
const base={confirmed:true,artworkApproved:false,filled:false,paymentStatus:"not_collected",paymentIsTest:false,editionStatus:"open",kinds:[] as string[]};
test("preview/download, filled campaign and status labels do not establish mailing or payment",()=>{
 const result=reservationTimeline({...base,filled:true,editionStatus:"mailed"});expect(result.filter(x=>x.complete).map(x=>x.label)).toEqual(["Reservation confirmed","Campaign filled"]);
});
test("genuine published evidence supports separate mailing milestones without assuming household delivery",()=>{
 const result=reservationTimeline({...base,kinds:["printer_confirmation","postal_acceptance"]});expect(result.slice(4).map(x=>x.complete)).toEqual([true,true,false]);
 expect(reservationTimeline({...base,editionStatus:"completed",kinds:["mailing_confirmation"]})[6].complete).toBe(true);
});
test("simulated/test payments never appear as live collection",()=>{
 expect(reservationTimeline({...base,paymentStatus:"succeeded",paymentIsTest:true})[3].complete).toBe(false);
 expect(reservationTimeline({...base,paymentStatus:"succeeded"})[3].complete).toBe(true);
});

test("historical or test payment state cannot be presented as definitely unpaid or live-paid",()=>{
 expect(customerPaymentStatus("charged",null)).toBe("unverified");
 expect(customerPaymentStatus("charge_failed",null)).toBe("unverified");
 expect(customerPaymentStatus("reserved",null)).toBe("not_collected");
 expect(customerPaymentStatus("charged",{status:"succeeded",stripe_mode:"test"})).toBe("test_payment");
 expect(customerPaymentStatus("charged",{status:"succeeded",stripe_mode:null})).toBe("unverified");
 expect(customerPaymentStatus("charged",{status:"succeeded",stripe_mode:"live"})).toBe("succeeded");
});
