"use client";
/* Private authenticated/blob images must bypass the public image optimizer. */
/* eslint-disable @next/next/no-img-element */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
export function PrintDownload({ editionId, ready = false, houseReady = false, filled }: { editionId: string; ready?: boolean; houseReady?: boolean; filled?: number }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => () => previews.forEach(url => URL.revokeObjectURL(url)), [previews]);
  return <Card><h2 className="text-xl font-semibold">Current postcard</h2>
    <p className="my-3 font-medium">{ready ? "Ready to mail" : "PREVIEW — NOT READY TO MAIL"}</p>
    {!houseReady && <p role="alert" className="mb-3 text-sm">Permanent house artwork needs attention. Re-save the house advertisement in Settings before the campaign can become Ready to Mail. <a className="underline" href="/admin/settings">Go to Settings</a></p>}
    {filled !== undefined && <p className="mb-3 text-sm">{filled} of 10 spots filled</p>}
    <p className="mb-3 text-sm text-muted">Preview the postcard, then download its front and back. Empty ad spaces are marked Available. Use the files for mailing only when the status above says Ready to mail.</p>
    <Button variant="secondary" disabled={busy} onClick={async () => {
      setBusy(true); setMessage(""); const urls: string[] = [];
      try {
        for (const side of ["front", "back"]) {
          const body = new FormData(); body.set("side", side);
          const response = await fetch(`/admin/print/${editionId}`, {method:"POST",body});
          if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png")) throw new Error(response.redirected || response.status === 401 || response.status === 403 ? "Please sign in again." : response.headers.get("content-type")?.includes("text/html") ? "Could not load preview. Please retry." : await response.text());
          urls.push(URL.createObjectURL(await response.blob()));
        }
        setPreviews(urls);
      } catch(error) { urls.forEach(url=>URL.revokeObjectURL(url)); setMessage(error instanceof Error ? error.message : "Preview failed."); }
      finally { setBusy(false); }
    }}>Preview postcard</Button>
    {!!previews.length && <div className="my-4 grid gap-4 sm:grid-cols-2">{previews.map((url,i)=><figure key={url}><figcaption>{i===0 ? "Front" : "Back"} — current preview</figcaption><img src={url} alt={`${i===0 ? "Front" : "Back"} current postcard`} className="w-full border border-line" /></figure>)}</div>}
    <form className="mt-3 space-y-4" onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      const data = new FormData(event.currentTarget);
      const side = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
      if (side !== "front" && side !== "back") return;
      data.set("side", side);
      setBusy(true); setMessage("");
      try {
        const response = await fetch(`/admin/print/${editionId}`, { method: "POST", body: data });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png")) throw new Error(response.redirected ? "Please sign in again." : await response.text());
        const isPreview = response.headers.get("X-Postcard-Readiness") !== "ready";
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a"); link.href = url; link.download = `inside914-${editionId}-${side}${isPreview ? "-PREVIEW" : ""}.png`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage(`${side === "front" ? "Front" : "Back"} downloaded. ${isPreview ? "PREVIEW — NOT READY TO MAIL" : "Ready to mail. Upload both files to AmazingMail."}`);
      } catch (e) { setMessage(e instanceof Error ? e.message : "Download failed. Please retry."); }
      finally { setBusy(false); }
    }}>
      <div className="flex flex-wrap gap-3"><Button type="submit" name="side" value="front" disabled={busy}>Download front</Button><Button type="submit" name="side" value="back" disabled={busy}>Download back</Button></div>
      {busy && <p role="status">Preparing high-resolution artwork…</p>}{message && <p role="status">{message}</p>}
    </form></Card>;
}
