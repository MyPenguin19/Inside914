import {expect,test} from "vitest";
import {campaignOperationStatus,simplePaymentStatus} from "@/lib/admin/operations";
const full={status:"approved_to_print",paused:false,filled:10,approved:10,paid:8,issues:2,chargeReady:true,mailReady:false};
test("partial payment failures are attention items, never fully paid or mail ready",()=>{
 expect(campaignOperationStatus(full)).toBe("Payment issues");
 expect(simplePaymentStatus("requires_action")).toBe("Needs attention");
 expect(simplePaymentStatus("requires_payment_method")).toBe("Needs attention");
 expect(simplePaymentStatus("succeeded")).toBe("Paid");
 expect(campaignOperationStatus({...full,paid:10,issues:0})).toBe("Paid — final review needed");
 expect(campaignOperationStatus({...full,paid:10,issues:0,mailReady:true})).toBe("Ready to mail");
});
test("simple campaign labels retain explicit closing, approval and mailing",()=>{
 expect(campaignOperationStatus({...full,status:"draft"})).toBe("Draft");
 expect(campaignOperationStatus({...full,issues:0,filled:7})).toBe("7 of 10 filled");
 expect(campaignOperationStatus({...full,issues:0,approved:9})).toBe("Full — artwork review needed");
 expect(campaignOperationStatus({...full,issues:0,paid:0})).toBe("Ready to charge");
 expect(campaignOperationStatus({...full,status:"mailed"})).toBe("Mailed");
});
