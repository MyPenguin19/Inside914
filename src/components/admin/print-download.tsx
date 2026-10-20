"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
export function PrintDownload({ editionId }: { editionId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <Card><h2 className="text-xl font-semibold">Download front and back</h2>
    <p className="my-3 text-sm text-muted">Once all 10 advertisements are approved, download high-resolution PNG files with bleed (9.125 × 6.125 inches). Add your two house advertisements for the back. These files still need the printer’s final proof approval before mailing.</p>
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      const data = new FormData(event.currentTarget);
      const side = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
      if (side !== "front" && side !== "back") return;
      data.set("side", side);
      if (side === "front") { data.delete("inside914"); data.delete("inside-diagnostics"); }
      setBusy(true); setMessage("");
      try {
        const response = await fetch(`/admin/print/${editionId}`, { method: "POST", body: data });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png")) throw new Error(response.redirected ? "Please sign in again." : await response.text());
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a"); link.href = url; link.download = `inside914-${editionId}-${side}.png`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage(`${side === "front" ? "Front" : "Back"} downloaded. Submit both sides for printer proof approval.`);
      } catch (e) { setMessage(e instanceof Error ? e.message : "Download failed. Please retry."); }
      finally { setBusy(false); }
    }}>
      {[ ["inside914", "Inside914 house advertisement"], ["inside-diagnostics", "Inside Diagnostics house advertisement"] ].map(([name, label]) => <label key={name} className="block text-sm">{label}<input type="file" name={name} accept="image/png,image/jpeg" className="mt-1 block max-w-full" disabled={busy} /></label>)}
      <p className="text-sm text-muted">House images are used for this download only. Complete images are fitted without cropping. Postal space remains blank.</p>
      <div className="flex flex-wrap gap-3"><Button type="submit" name="side" value="front" disabled={busy}>Download front</Button><Button type="submit" name="side" value="back" disabled={busy}>Download back</Button></div>
      {busy && <p role="status">Preparing high-resolution artwork…</p>}{message && <p role="status">{message}</p>}
    </form></Card>;
}
