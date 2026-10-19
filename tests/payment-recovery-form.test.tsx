import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
const api=vi.hoisted(()=>({handleNextAction:vi.fn(async()=>({})),confirmPayment:vi.fn(async()=>({})),elements:vi.fn(()=>({create:()=>({mount:()=>{},on:(_event:string,ready:()=>void)=>ready(),destroy:()=>{}})}))}));
vi.mock("@stripe/stripe-js",()=>({loadStripe:async()=>api}));
import { RecoveryForm } from "@/components/payments/recovery-form";
afterEach(()=>{cleanup();vi.clearAllMocks();});
test("authentication recovery handles the same intent client secret",async()=>{
 render(<RecoveryForm clientSecret="pi_test_secret" publishableKey="pk_test_fixture" requiresAction/>);
 const button=screen.getByRole("button",{name:"Authenticate $399 test payment"});await waitFor(()=>expect(button.hasAttribute("disabled")).toBe(false));
 fireEvent.click(button);await waitFor(()=>expect(api.handleNextAction).toHaveBeenCalledWith({clientSecret:"pi_test_secret"}));expect(api.confirmPayment).not.toHaveBeenCalled();
 await screen.findByText(/Confirmation is pending/);
});
test("replacement card submits the Payment Element for the existing intent",async()=>{
 render(<RecoveryForm clientSecret="pi_test_secret" publishableKey="pk_test_fixture" requiresAction={false}/>);
 const button=screen.getByRole("button",{name:"Pay $399 in test mode"});await waitFor(()=>expect(button.hasAttribute("disabled")).toBe(false));
 fireEvent.click(button);await waitFor(()=>expect(api.confirmPayment).toHaveBeenCalledWith(expect.objectContaining({redirect:"if_required"})));expect(api.handleNextAction).not.toHaveBeenCalled();
});

test("live recovery authenticates the existing intent without test wording",async()=>{
 render(<RecoveryForm mode="live" clientSecret="pi_live_secret_fixture" publishableKey="pk_live_fixture" requiresAction/>);
 const button=screen.getByRole("button",{name:"Authenticate $399 payment"});
 await waitFor(()=>expect(button.hasAttribute("disabled")).toBe(false));fireEvent.click(button);
 await waitFor(()=>expect(api.handleNextAction).toHaveBeenCalledWith({clientSecret:"pi_live_secret_fixture"}));
 expect(api.confirmPayment).not.toHaveBeenCalled();
});
