"use client";
import { useActionState } from "react";
import { createInvitation,sendInvitation,type InvitationState } from "@/app/admin/invitation-actions";
import { Button } from "@/components/ui/button";
import { TextField,SelectField } from "@/components/ui/field";
export function CampaignInvitations({editionId,positions}:{editionId:string;positions:{id:string;label:string}[]}) {
 const [state,create,pending]=useActionState(createInvitation,{});
 return <details className="rounded-2xl border border-line p-5"><summary className="cursor-pointer text-lg font-semibold">Invite a business</summary>
 <p className="my-3 text-sm text-muted">Create a link for an interested business. It does not hold a position. Email only a business you have permission to contact.</p>
 {!positions.length?<p>No positions are currently available for invitations.</p>:<form action={create} className="grid gap-4 sm:grid-cols-2">
 <input type="hidden" name="edition" value={editionId}/><SelectField id="invite-position" name="slot" label="Available position" required>{positions.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</SelectField>
 <TextField id="invite-name" name="name" label="Business name" optional maxLength={120}/><TextField id="invite-email" name="email" type="email" label="Business email" optional/>
 <div><Button disabled={pending} type="submit">{pending?"Creating…":"Create invitation preview"}</Button></div></form>}
 {state.message&&<p role="status" className="mt-3 text-sm">{state.message}</p>}
 {state.preview&&<section className="mt-4 space-y-3" aria-label="Invitation preview"><h3 className="font-semibold">{state.preview.subject}</h3>
 <a className="block break-all underline" href={state.preview.link}>{state.preview.link}</a><pre className="whitespace-pre-wrap break-words font-sans text-sm">{state.preview.text}</pre>
 {state.preview.recipient&&<InvitationSend key={state.preview.id} preview={state.preview}/>}</section>}
 </details>;
}

function InvitationSend({preview}:{preview:NonNullable<InvitationState["preview"]>}) {
 const [sent,send,sending]=useActionState(sendInvitation,{});
 return <><form action={send} className="space-y-3"><input type="hidden" name="id" value={preview.id}/><input type="hidden" name="fingerprint" value={preview.fingerprint}/>
 <label className="flex items-start gap-2 text-sm"><input name="confirm" value="yes" type="checkbox" required/>I reviewed this message and authorize sending it to {preview.recipient}.</label>
 <Button disabled={sending||sent.sent} type="submit">{sending?"Queuing…":sent.sent?"Invitation queued":"Send this invitation"}</Button></form>
 {sent.message&&<p role="status" className="text-sm">{sent.message}</p>}</>;
}
