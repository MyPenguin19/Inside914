import { expect, test } from "vitest";
import { zoneCampaigns, zoneReadiness } from "@/lib/admin/zone-readiness";
import { SQUARE_TEMPLATE } from "@/lib/admin/layouts";
import type { AdminBooking, AdminEdition } from "@/lib/admin/metrics";
const edition: AdminEdition = {id:"e",productModel:"square_v1",zoneName:"Central Westchester",households:5000,issueMonth:"2027-01-01",artworkDeadline:"2026-12-15",mailDate:null,status:"closed",layoutTemplate:SQUARE_TEMPLATE.key,mailingWindowStart:"2027-01-11",mailingWindowEnd:"2027-01-15"};
const slots = SQUARE_TEMPLATE.slots.map((s,i) => ({...s,id:`s${i}`,editionId:"e"}));
const bookings: AdminBooking[] = slots.map((s,i) => ({id:`b${i}`,editionId:"e",categoryId:`cat-${i}`,status:"reserved",size:"standard",priceCents:39900,pricingMode:"launch",holdExpiresAt:null,reference:null,createdAt:"2026-10-19",confirmedAt:"2026-10-19",stripeCustomerId:"cus",stripeSetupIntentId:null,stripePaymentMethodId:"pm",stripeSetupStatus:null,stripeSetupStatusAt:null,contact:null,artwork:{status:"ready",cropped:true,square:true,updatedAt:"2026-10-19"},artworkReview:"approved",claims:[{slotId:s.id,released:false}]}));
const consents = new Map(bookings.map(b => [b.id,{amountCents:39900}]));
const evaluate = (rows=bookings) => zoneReadiness(edition,slots,rows,consents);
test("ten valid reservations do not enable charging or approve the final print proof", () => {
  const result=evaluate();expect(result.validCount).toBe(10);expect(result.ready).toBe(false);
  expect(result.checks.filter(c=>!c.ready).map(c=>c.label)).toEqual(["House artwork and final proof approved"]);
});
test("nine is not full and other zones cannot fill it",()=>{
  expect(evaluate([...bookings.slice(0,9),{...bookings[9],editionId:"other"}]).validCount).toBe(9);
});
test.each(["pending","released","cancelled","charge_failed","charged","rejected"])("%s does not count as valid", status=>{
  expect(evaluate([{...bookings[0],status},...bookings.slice(1)]).validCount).toBe(9);
});
test("duplicate categories invalidate both conflicting reservations",()=>{
  expect(evaluate([{...bookings[0],categoryId:bookings[1].categoryId},...bookings.slice(1)]).validCount).toBe(8);
});
test("duplicate slot claims invalidate both conflicting reservations",()=>{
  expect(evaluate([{...bookings[0],claims:bookings[1].claims},...bookings.slice(1)]).validCount).toBe(8);
});
test.each([{categoryId:null},{stripeCustomerId:null},{stripeSetupStatus:"failed" as const},{stripeSetupStatus:"canceled" as const},{stripePaymentMethodId:null},{priceCents:100},{confirmedAt:null},{claims:[]},{flag:{at:"now",reason:"investigate"}}])("incomplete reservation is excluded: %j", change=>{
  expect(evaluate([{...bookings[0],...change},...bookings.slice(1)]).validCount).toBe(9);
});
test("missing consent, blocked slot and missing inventory prevent readiness",()=>{
  expect(zoneReadiness(edition,slots,bookings,new Map()).validCount).toBe(0);
  expect(zoneReadiness(edition,[{...slots[0],blockedAt:"now"},...slots.slice(1)],bookings,consents).validCount).toBe(9);
  expect(zoneReadiness(edition,slots.slice(1),bookings,consents).checks[0].ready).toBe(false);
});
test("uncropped or unapproved artwork remains a blocker at ten reservations",()=>{
  const result=evaluate([{...bookings[0],artwork:{status:"ready",cropped:true,square:false,updatedAt:"now"}},...bookings.slice(1)]);
  expect(result.checks.find(c=>c.label.includes("square artworks"))?.ready).toBe(false);
});
test("overview always returns four zones and prioritizes the open campaign",()=>{
  const result=zoneCampaigns([{...edition,id:"future",issueMonth:"2028-01-01",status:"draft"},{...edition,id:"open",status:"open"},{...edition,id:"old",status:"completed"}]);
  expect(result).toHaveLength(4);expect(result[0].campaign?.id).toBe("open");expect(result.slice(1).every(r=>r.campaign===null)).toBe(true);
});
