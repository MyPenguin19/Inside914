"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { extendAreaCheckout } from "@/app/book/cart/actions";
import { Button } from "@/components/ui/button";
export function CartHoldTimer({expiresAt}:{expiresAt:string}) {
 const [expiry,setExpiry]=useState(expiresAt),[now,setNow]=useState(0),[used,setUsed]=useState(false),[pending,setPending]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{const tick=()=>setNow(Date.now());tick();const id=setInterval(tick,1000);return()=>clearInterval(id);},[]);
 const left=now?Math.max(0,Math.ceil((Date.parse(expiry)-now)/1000)):null;
 const expired=left===0;
 return <section aria-label="Checkout time" className="rounded-xl border border-line bg-surface p-4 text-sm">
  <p>{expired?"Your hold expired. No reservation was confirmed.":<>All selected areas share this checkout window: <strong className="tabular-nums">{left===null?"Loading timer…":`${Math.floor(left/60)}:${String(left%60).padStart(2,"0")}`}</strong></>}</p>
  {left!==null&&left>0&&left<=300&&<p role="status">Less than five minutes remain. Finish checkout or use your one extension.</p>}
  {!expired&&left!==null&&left<=300&&!used&&<Button variant="secondary" disabled={pending} onClick={async()=>{setPending(true);try{const r=await extendAreaCheckout();if(r.ok&&r.expiresAt){setExpiry(r.expiresAt);setUsed(true);}setMessage(r.message);}catch{setMessage("Connection interrupted. Reconnect and refresh to check the current deadline.");}finally{setPending(false);}}}>{pending?"Extending…":"Add 15 minutes for all areas"}</Button>}
  {message&&<p role="status">{message}</p>}{expired&&<Link className="underline" href="/book/cart">Review expired areas and restart</Link>}
 </section>;
}
