import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CategoryZoneSelector, type CategoryCatalog } from "@/components/booking/category-zone-selector";
import { REGIONS } from "@/lib/catalog/regions";
const {hold,push,refresh}=vi.hoisted(()=>({hold:vi.fn(),push:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({push,refresh})}));
vi.mock("@/app/book/cart/actions",()=>({holdAreas:hold}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const props:CategoryCatalog & {checkoutOpen:boolean}={ checkoutOpen:true, editions: REGIONS.map((r,i)=>({id:`e${i}`,productModel:"square_v1",zoneSlug:r.slug,zoneName:r.name,households:5000,issueMonth:"2027-01-01",artworkDeadline:"2026-12-15",mailDate:null,unitPriceCents:39900,doublePriceCents:null,pricingMode:"test",bookable:true,totalUnits:10,availableUnits:10,pairs:[],slots:[{id:`s${i}`,side:"front",label:"F1",x:0.75,y:0.5,width:2.5,height:2.5,available:true}]})) };
test("closed checkout allows previews but never offers an active hold action",()=>{
 render(<CategoryZoneSelector {...props} checkoutOpen={false}/>);
 fireEvent.click(screen.getByRole("checkbox",{name:/Central/}));
 fireEvent.click(screen.getByRole("button",{name:"Preview selected areas"}));
 fireEvent.click(screen.getByRole("button",{name:/position F1:/}));
 expect(screen.getByRole("button",{name:"Reservations not open yet"})).toHaveProperty("disabled",true);
 expect(screen.queryByRole("button",{name:"Continue to artwork"})).toBeNull();
 expect(screen.getByRole("status").textContent).toContain("Reservations are not open yet");
 expect(screen.queryByRole("link",{name:"Return to held areas"})).toBeNull();
 expect(hold).not.toHaveBeenCalled();
});
test("a disconnected hold request keeps the chosen square and explains how to retry",async()=>{
 hold.mockRejectedValueOnce(new TypeError("Failed to fetch"));
 render(<CategoryZoneSelector {...props} checkoutOpen/>);
 fireEvent.click(screen.getByRole("checkbox",{name:/Central/}));
 fireEvent.click(screen.getByRole("button",{name:"Continue with selected areas"}));
 fireEvent.click(screen.getByRole("button",{name:/position F1:/}));
 fireEvent.click(screen.getByRole("button",{name:"Continue to artwork"}));
 await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("Connection interrupted"));
 expect(screen.getByRole("button",{name:/position F1:/}).getAttribute("aria-pressed")).toBe("true");
 expect(push).not.toHaveBeenCalled();
 hold.mockResolvedValueOnce({ok:true});
 const retry = await screen.findByRole("button",{name:"Continue to artwork"});
 await waitFor(()=>expect(retry).toHaveProperty("disabled",false));
 fireEvent.click(retry);
 await waitFor(()=>expect(push).toHaveBeenCalledWith("/book/artwork"));
});
test("a refreshed catalog cannot submit a selected position that became unavailable",()=>{
 const {rerender}=render(<CategoryZoneSelector {...props}/>);
 fireEvent.click(screen.getByRole("checkbox",{name:/Central/}));
 fireEvent.click(screen.getByRole("button",{name:"Continue with selected areas"}));
 fireEvent.click(screen.getByRole("button",{name:/position F1:/}));
 rerender(<CategoryZoneSelector {...props} editions={props.editions.map(e=>({...e,slots:e.slots.map(s=>({...s,available:false}))}))}/>);
 expect(screen.getByRole("button",{name:"Continue to artwork"})).toHaveProperty("disabled",true);
 expect(hold).not.toHaveBeenCalled();
});
test("areas need no category and each selected area needs an explicit square", async()=>{
 hold.mockResolvedValue({ok:true});render(<CategoryZoneSelector {...props}/>);
 expect(screen.queryByLabelText("Choose your business category")).toBeNull();
 for(const name of [/Central/,/Southern/])fireEvent.click(screen.getByRole("checkbox",{name}));
 expect(screen.getByText("Total if both campaigns fill: $798")).toBeTruthy();
 expect(screen.getByText(/10,000 households, provisional/)).toBeTruthy();
 expect(screen.getByText("Due today: $0")).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Continue with selected areas"}));
 expect((screen.getByRole("button",{name:"Continue to artwork"}) as HTMLButtonElement).disabled).toBe(true);
 for(const name of ["Central Westchester","Southern Westchester"]) { fireEvent.click(screen.getByRole("button",{name:`Choose position for ${name}`})); fireEvent.click(within(screen.getByRole("region",{name})).getByRole("button",{name:/position F1:/})); }
 fireEvent.click(screen.getByRole("button",{name:"Continue to artwork"}));
 await waitFor(()=>expect(push).toHaveBeenCalledWith("/book/artwork"));
 expect(hold).toHaveBeenCalledWith({selections:[{editionId:"e0",slotId:"s0"},{editionId:"e1",slotId:"s1"}]});
});
test("lost square race refreshes availability without substituting another position",async()=>{
 hold.mockResolvedValue({ok:false,message:"Square just reserved; nothing held."});
 render(<CategoryZoneSelector {...props}/>);
 fireEvent.click(screen.getByRole("checkbox",{name:/Central/}));
 fireEvent.click(screen.getByRole("button",{name:"Continue with selected areas"}));
 fireEvent.click(screen.getByRole("button",{name:/position F1:/}));
 fireEvent.click(screen.getByRole("button",{name:"Continue to artwork"}));
 await waitFor(()=>expect(refresh).toHaveBeenCalled());
 expect(push).not.toHaveBeenCalled();expect(screen.getByRole("alert").textContent).toContain("nothing held");
});

test.each([[1,"$399"],[2,"$798"],[3,"$1,197"],[4,"$1,596"]] as const)("%i areas show the correct authorization with zero due today",(count,total)=>{
 render(<CategoryZoneSelector {...props}/>);
 for(const region of REGIONS.slice(0,count)) fireEvent.click(screen.getByRole("checkbox",{name:new RegExp(region.name)}));
 expect(screen.getByText(`${count === 1 ? "Total if this campaign fills" : count === 2 ? "Total if both campaigns fill" : "Total if all selected campaigns fill"}: ${total}`)).toBeTruthy();
 expect(screen.getByText("Due today: $0")).toBeTruthy();
 expect(screen.queryByLabelText("Choose your business category")).toBeNull();
});

test("map and area cards share selection, including keyboard controls", () => {
 render(<CategoryZoneSelector {...props}/>);
 const map = screen.getByRole("button", {name: /Northern Westchester on map/});
 fireEvent.click(map);
 expect((screen.getByRole("checkbox", {name: /Northern Westchester/}) as HTMLInputElement).checked).toBe(true);
 expect(map.getAttribute("aria-pressed")).toBe("true");
 fireEvent.keyDown(map, {key: " "});
 expect((screen.getByRole("checkbox", {name: /Northern Westchester/}) as HTMLInputElement).checked).toBe(false);
 fireEvent.click(screen.getByRole("checkbox", {name: /Northern Westchester/}));
 expect(map.getAttribute("aria-pressed")).toBe("true");
 expect(hold).not.toHaveBeenCalled();
});

test("the map cannot select a closed or full campaign", () => {
 render(<CategoryZoneSelector checkoutOpen editions={[{...props.editions[0], availableUnits: 0}]}/>);
 for (const area of ["Central", "Northern"]) {
  const button = screen.getByRole("button", {name: new RegExp(`${area} Westchester on map`)});
  expect(button.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(button); fireEvent.keyDown(button, {key:"Enter"});
  expect(button.getAttribute("aria-pressed")).toBe("false");
 }
 expect(hold).not.toHaveBeenCalled();
});

test("different campaign prices produce a correct multi-area authorization",()=>{
 render(<CategoryZoneSelector checkoutOpen editions={props.editions.map((e,i)=>({...e,unitPriceCents:[39900,44900,29900,39900][i]}))}/>);
 for(const name of [/Central/,/Southern/,/Northern/])fireEvent.click(screen.getByRole("checkbox",{name}));
 expect(screen.getByText("Total if all selected campaigns fill: $1,147")).toBeTruthy();
 expect(screen.getByText("Due today: $0")).toBeTruthy();
 expect(hold).not.toHaveBeenCalled();
});

test("closed checkout displays its neutral server refusal in the area picker",async()=>{
 const message="Reservations are not open yet. You can explore the advertising areas or contact Info@inside914.com.";
 hold.mockResolvedValue({ok:false,message});render(<CategoryZoneSelector {...props}/>);
 fireEvent.click(screen.getByRole("checkbox",{name:/Central/}));
 fireEvent.click(screen.getByRole("button",{name:"Continue with selected areas"}));
 fireEvent.click(screen.getByRole("button",{name:/position F1:/}));
 fireEvent.click(screen.getByRole("button",{name:"Continue to artwork"}));
 await waitFor(()=>expect(screen.getByRole("alert").textContent).toBe(message));
 expect(push).not.toHaveBeenCalled();
 expect(screen.getByRole("heading",{name:"Choose one position in each area"})).toBeTruthy();
});


test("one position picker at a time keeps previous choices when going back", () => {
 render(<CategoryZoneSelector {...props}/>);
 for(const name of [/Central/, /Southern/]) fireEvent.click(screen.getByRole("checkbox",{name}));
 fireEvent.click(screen.getByRole("button",{name:"Continue with selected areas"}));
 expect(screen.queryByRole("region",{name:"Southern Westchester"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:/position F1:/}));
 fireEvent.click(screen.getByRole("button",{name:"Next: Southern Westchester"}));
 expect(screen.queryByRole("region",{name:"Central Westchester"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:/position F1:/}));
 expect(screen.getByRole("button",{name:"Continue to artwork"})).toHaveProperty("disabled",false);
 fireEvent.click(screen.getByRole("button",{name:"Change areas"}));
 fireEvent.click(screen.getByRole("checkbox",{name:/Southern/}));
 fireEvent.click(screen.getByRole("button",{name:"Continue with selected areas"}));
 expect(screen.getByRole("button",{name:/position F1:/}).getAttribute("aria-pressed")).toBe("true");
 expect(screen.getByRole("button",{name:"Continue to artwork"})).toHaveProperty("disabled",false);
 expect(hold).not.toHaveBeenCalled();
});
