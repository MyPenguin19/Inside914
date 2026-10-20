import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
vi.mock("@/app/admin/admin-actions",()=>({setCampaignStatus:vi.fn(),extendDeadline:vi.fn()}));
import { setCampaignStatus } from "@/app/admin/admin-actions";
import { CampaignStatusControls } from "@/components/admin/campaign-status-controls";
import { SQUARE_TEMPLATE } from "@/lib/admin/layouts";
import { campaignStats, type AdminEdition } from "@/lib/admin/metrics";
afterEach(()=>{cleanup();vi.clearAllMocks();});
const edition:AdminEdition={id:"fixture",zoneName:"Central Westchester",households:5000,issueMonth:"2098-01-01",artworkDeadline:"2097-12-16",mailDate:null,status:"draft",layoutTemplate:SQUARE_TEMPLATE.key,productModel:"square_v1"};
function show(layoutTemplate:string) {
 const e={...edition,layoutTemplate};
 render(<CampaignStatusControls edition={e} stats={campaignStats(e,[],[],Date.now())} now={Date.now()}/>);
}
test.each(["provisional-2x4", "unknown-layout"])("unapproved template %s cannot offer opening",key=>{
 show(key);
 expect(screen.queryByRole("button",{name:"Open for reservations"})).toBeNull();
 expect(screen.getByText("Campaign created successfully. It is still a draft and cannot accept reservations until the postcard layout is approved.")).toBeTruthy();
});
test("approved layout offers opening but requires explicit confirmation",()=>{
 show(SQUARE_TEMPLATE.key);
 expect(screen.getByText("Layout approved. Open this campaign when you're ready to accept reservations.")).toBeTruthy();
 expect(setCampaignStatus).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Open for reservations"}));
 expect(screen.getByRole("button",{name:"Open now"})).toBeTruthy();
 expect(setCampaignStatus).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Keep as is"}));
 expect(setCampaignStatus).not.toHaveBeenCalled();
});
