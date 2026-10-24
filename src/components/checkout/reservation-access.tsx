"use client";
import { useActionState, useEffect, useState } from "react";
import { openPrivateReservation, recoverReservation } from "@/app/reservation/actions";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
export function ReservationAccess({recovery=false}:{recovery?:boolean}) {
 const [token,setToken]=useState("");
 const [state,action,pending]=useActionState(recoverReservation,{});
 const [error,setError]=useState("");const [opening,setOpening]=useState(false);
 useEffect(()=>{const frame=requestAnimationFrame(()=>{const value=window.location.hash.slice(1);if(value){setToken(value);window.history.replaceState(null,"",window.location.pathname);}});return()=>cancelAnimationFrame(frame);},[]);
 if(token) return <section className="space-y-4"><h1 className="text-3xl font-semibold">Your private reservation</h1><p>This link is for you. Keep it private.</p>
  <Button disabled={opening} onClick={async()=>{setOpening(true);try {const result=await openPrivateReservation(token,recovery);setError(result.message??"");}finally{setOpening(false);}}}>{opening?"Opening…":"Open reservation"}</Button>{error&&<p role="alert">{error} <a href="/reservation/recover" className="underline">Request another link</a></p>}</section>;
 return <form action={action} className="space-y-5"><h1 className="text-3xl font-semibold">Find your reservation</h1><p>Enter the email and reference from your reservation.</p>
  <TextField id="email" name="email" type="email" label="Email" required/><TextField id="reference" name="reference" label="Reservation reference" required/>
  <Button type="submit" disabled={pending}>{pending?"Requesting…":"Email a private link"}</Button>{state.message&&<p role="status">{state.message}</p>}</form>;
}
