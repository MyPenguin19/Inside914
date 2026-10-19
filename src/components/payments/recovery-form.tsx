"use client";
import { useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
export function RecoveryForm({clientSecret,publishableKey,requiresAction,mode="test"}:{mode?:"test"|"live";clientSecret:string;publishableKey:string;requiresAction:boolean}) {
  const node=useRef<HTMLDivElement>(null);const api=useRef<{stripe:Stripe;elements:StripeElements}|null>(null);
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  useEffect(()=>{
    let active=true;let cleanup:(()=>void)|undefined;
    loadStripe(publishableKey).then(stripe=>{
      if(!stripe || !active || !node.current)return;
      const elements=stripe.elements({clientSecret});api.current={stripe,elements};
      if(requiresAction){setReady(true);return;}
      const payment=elements.create("payment");payment.mount(node.current);payment.on("ready",()=>setReady(true));cleanup=()=>payment.destroy();
    }).catch(()=>setMessage("Payment form unavailable. Please try again."));
    return ()=>{active=false;api.current=null;cleanup?.();};
  },[clientSecret,publishableKey,requiresAction]);
  return <form onSubmit={async e=>{e.preventDefault();if(!api.current||busy)return;setBusy(true);setMessage("");try{
    const {stripe,elements}=api.current;
    const result=requiresAction ? await stripe.handleNextAction({clientSecret}) : await stripe.confirmPayment({elements,confirmParams:{return_url:window.location.origin+"/pay"},redirect:"if_required"});
    setMessage(result.error?.message ?? "Payment submitted. Confirmation is pending; please refresh to check status.");
  }catch{setMessage("Payment could not be completed. Please try again.");}finally{setBusy(false);}}} className="mt-4 flex flex-col gap-4">
    <div ref={node}/><Button type="submit" disabled={!ready||busy}>{requiresAction ? (mode === "live" ? "Authenticate $399 payment" : "Authenticate $399 test payment") : (mode === "live" ? "Pay $399" : "Pay $399 in test mode")}</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>;
}
