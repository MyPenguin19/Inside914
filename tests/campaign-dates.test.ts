import { expect, test } from "vitest";
import { CampaignForm, isoToNyLocal, nyLocalToIso } from "@/lib/admin/campaign-form";
import { FIRST_CAMPAIGN_DEFAULTS } from "@/lib/admin/first-campaign";

test.each(["2027-02-30T12:00", "2027-13-01T12:00", "2027-01-01T24:00", "2027-01-01T12:60", "2027-03-14T02:30"])("rejects nonexistent New York wall time %s", value=>{
 expect(nyLocalToIso(value)).toBeNull();
});
test.each([["2027-01-10T15:30","2027-01-10T20:30:00.000Z"],["2027-07-10T15:30","2027-07-10T19:30:00.000Z"],["2027-11-07T01:30","2027-11-07T05:30:00.000Z"]])("round trips valid New York time %s", (local,utc)=>{
 expect(nyLocalToIso(local)).toBe(utc);expect(isoToNyLocal(utc)).toBe(local);
});
test.each([["issue_month","2027-13"],["mailing_window_start","2027-02-30"],["mailing_window_end","2027-04-31"]])("rejects impossible %s",(field,value)=>{
 const result=CampaignForm.safeParse({...FIRST_CAMPAIGN_DEFAULTS,[field]:value});
 expect(result.success).toBe(false);
 if(!result.success) expect(result.error.issues.some(issue=>issue.path[0]===field)).toBe(true);
});
