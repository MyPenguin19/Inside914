import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { CampaignForm } from "@/components/admin/campaign-form";
import { V2_TEMPLATE } from "@/lib/admin/layouts";
import { FIRST_CAMPAIGN_DEFAULTS } from "@/lib/admin/first-campaign";
afterEach(cleanup);
test("cached create and edit forms have distinct labels and a writable future price",()=>{
 const props={action:vi.fn(async()=>({})),zones:[{id:"zone",name:"Central"}],templates:[V2_TEMPLATE],defaults:{...FIRST_CAMPAIGN_DEFAULTS,layout_template:V2_TEMPLATE.key,unit_price_cents:"449"}};
 const {container}=render(<><div hidden><CampaignForm {...props} mode="create"/></div><section aria-label="Current edit form"><CampaignForm {...props} mode="edit" id="campaign" locked/></section></>);
 const ids=[...container.querySelectorAll("[id]")].map(el=>el.id);expect(new Set(ids).size).toBe(ids.length);
 const current=within(screen.getByRole("region",{name:"Current edit form"}));
 const price=current.getByLabelText("Price per advertising position ($)",{exact:false}) as HTMLInputElement;
 expect(price.name).toBe("unit_price_cents");expect(price.value).toBe("449");expect(price.disabled).toBe(false);expect(price.readOnly).toBe(false);
 expect((current.getByLabelText("Postcard layout",{exact:false}) as HTMLSelectElement).disabled).toBe(true);
});
test("unused drafts allow one submitted area value while layout stays fixed",()=>{
 const {container}=render(<CampaignForm action={vi.fn(async()=>({}))} zones={[{id:"central",name:"Central"},{id:"southern",name:"Southern"}]} templates={[V2_TEMPLATE]} defaults={{...FIRST_CAMPAIGN_DEFAULTS,zone_id:"southern",layout_template:V2_TEMPLATE.key}} mode="edit" areaEditable id="campaign"/>);
 const area=screen.getByLabelText("Area",{exact:false}) as HTMLSelectElement;
 expect(area.disabled).toBe(false);expect(area.value).toBe("southern");
 area.value="central";
 container.querySelector("form")!.reset();
 expect(new FormData(container.querySelector("form")!).getAll("zone_id")).toEqual(["central"]);
 expect((screen.getByLabelText("Postcard layout",{exact:false}) as HTMLSelectElement).disabled).toBe(true);
});
