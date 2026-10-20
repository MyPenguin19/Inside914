"use client";
/* Private authenticated/blob images must bypass the public image optimizer. */
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
export function HouseArtworkForm({ updatedAt }: { updatedAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <Card><h2 className="text-xl font-semibold">Permanent Back-Side House Ad</h2>
    <p className="my-3 text-sm text-muted">Upload one combined image containing your house advertisements. Every campaign uses it automatically. Replacing it changes future downloads and requires a new final proof.</p>
    {updatedAt ? <img src={`/admin/house-artwork?v=${encodeURIComponent(updatedAt)}`} alt="Current permanent house advertisement" className="mb-4 w-full max-w-sm border border-line" /> : <p className="mb-4">No house artwork uploaded yet. Preview downloads will leave this panel blank.</p>}
    <p className="mb-4 text-sm text-muted">Panel: 3.7375 × 2.6075 inches. Recommended ratio: 2990:2086; recommended image: 2990 × 2086 pixels. Minimum: 1122 × 783 pixels. The complete image is fitted without cropping or stretching.</p>
    <form className="space-y-3" onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      const data = new FormData(event.currentTarget); setBusy(true); setMessage("");
      try {
        const response = await fetch("/admin/house-artwork", { method: "POST", body: data });
        if (!response.ok || response.redirected) throw new Error(response.redirected ? "Please sign in again." : await response.text());
        setMessage("House artwork saved. Future downloads will use this image."); router.refresh();
      } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed."); }
      finally { setBusy(false); }
    }}><label className="block text-sm">House artwork (PNG or JPEG, up to 3 MB)<input required type="file" name="artwork" accept="image/png,image/jpeg" disabled={busy} className="mt-2 block max-w-full" /></label>
    <Button type="submit" disabled={busy}>{busy ? "Saving…" : updatedAt ? "Replace artwork" : "Save house artwork"}</Button>
    {message && <p role="status">{message}</p>}</form></Card>;
}
