"use client";
import { useActionState } from "react";
import { recoveryLink } from "@/app/admin/collection-actions";
import { Button } from "@/components/ui/button";
export function RecoveryLink({id}:{id:string}) {
  const [state,action,pending]=useActionState(recoveryLink,{});
  return <form action={action} className="flex flex-wrap gap-2"><input type="hidden" name="id" value={id}/><Button type="submit" variant="secondary" disabled={pending}>Create private recovery link</Button>
    {state.url && <a className="underline" href={state.url} referrerPolicy="no-referrer">Open payment recovery</a>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
