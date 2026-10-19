import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CategoryZoneSelector, type CategoryCatalog } from "@/components/booking/category-zone-selector";
import { REGIONS } from "@/lib/catalog/regions";
const {hold,push,refresh}=vi.hoisted(()=>({hold:vi.fn(),push:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({push,refresh})}));
vi.mock("@/app/book/cart/actions",()=>({holdAreas:hold}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const props:CategoryCatalog={
 editions: REGIONS.map((r,i)=>({id:`e${i}`,productModel:"square_v1",zoneSlug:r.slug,zoneName:r.name,households:5000,issueMonth:"2027-01-01",artworkDeadline:"2026-12-15",mailDate:null,unitPriceCents:39900,doublePriceCents:null,pricingMode:"test",bookable:true,totalUnits:10,availableUnits:10})),
 categories:[{id:"plumbing",name:"Plumbing"},{id:"hvac",name:"HVAC"}],
 availability: REGIONS.flatMap((_,i)=>["plumbing","hvac"].map(category_id=>({edition_id:`e${i}`,category_id,occupancy:i===2&&category_id==="plumbing"?"reserved":"available"}))),
};
test("category first, unavailable zones disabled, totals and provisional reach follow selection",()=>{
 render(<CategoryZoneSelector {...props}/>);
 expect(screen.getAllByRole("checkbox").every(c=>(c as HTMLInputElement).disabled)).toBe(true);
 fireEvent.change(screen.getByLabelText("Choose your business category"),{target:{value:"plumbing"}});
 expect((screen.getByRole("checkbox",{name:/Northern/}) as HTMLInputElement).disabled).toBe(true);
 for(const name of [/Central/,/Southern/])fireEvent.click(screen.getByRole("checkbox",{name}));
 expect(screen.getByText("Maximum authorized total: $798")).toBeTruthy();
 expect(screen.getByText(/10,000 households, provisional/)).toBeTruthy();
 expect(screen.getByText("Due today: $0")).toBeTruthy();
 fireEvent.change(screen.getByLabelText("Choose your business category"),{target:{value:"hvac"}});
 expect(screen.getByText("Selected: 0 zones")).toBeTruthy();
 for(const box of screen.getAllByRole("checkbox"))fireEvent.click(box);
 expect(screen.getByText("Maximum authorized total: $1,596")).toBeTruthy();
});
test("lost category race refreshes availability without pretending a hold succeeded",async()=>{
 hold.mockResolvedValue({ok:false,message:"Category just reserved; nothing held."});
 render(<CategoryZoneSelector {...props}/>);
 fireEvent.change(screen.getByLabelText("Choose your business category"),{target:{value:"plumbing"}});
 fireEvent.click(screen.getByRole("checkbox",{name:/Central/}));
 fireEvent.click(screen.getByRole("button",{name:"Continue with selected zones"}));
 await waitFor(()=>expect(refresh).toHaveBeenCalled());
 expect(push).not.toHaveBeenCalled();
 expect(hold).toHaveBeenCalledWith({categoryId:"plumbing",editionIds:["e0"]});
 expect(screen.getByRole("alert").textContent).toContain("nothing held");
 expect(screen.getByText("Selected: 0 zones")).toBeTruthy();
});
