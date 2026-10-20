"use client";
/* Private authenticated/blob images must bypass the public image optimizer. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Cropper, { type Area } from "react-easy-crop";
import { CroppedImage } from "@/components/artwork/cropped-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export function HouseArtworkForm({ updatedAt }: { updatedAt: string | null }) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState("");
  const [crop, setCrop] = useState({x:0,y:0});
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [size, setSize] = useState({width:0,height:0});
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  const valid = !!area && area.width >= 1122 && area.height >= 783;
  return <Card><h2 className="text-xl font-semibold">Permanent Back-Side House Ad</h2>
    <p className="my-3 text-sm text-muted">Upload one combined image containing your house advertisements. Every campaign uses it automatically. Replacing it changes future downloads and requires a new final proof.</p>
    {updatedAt ? <img src={`/admin/house-artwork?v=${encodeURIComponent(updatedAt)}`} alt="Current permanent house advertisement" className="mb-4 w-full max-w-sm border border-line" /> : <p className="mb-4">No house artwork uploaded yet. Preview downloads will show the postcard background in this panel.</p>}
    <p className="mb-4 text-sm text-muted">Panel: 3.7375 × 2.6075 inches. Drag and zoom to choose the exact crop. Saved output: 2990 × 2086 pixels, without padding or stretching. The selected crop must be at least 1122 × 783 pixels.</p>
    <form className="space-y-3" onSubmit={async event => {
      event.preventDefault(); if (busy || !file || !valid) return;
      const data = new FormData(); data.set("artwork",file); data.set("crop",JSON.stringify(area)); setBusy(true); setMessage("");
      try {
        const response = await fetch("/admin/house-artwork", { method: "POST", body: data });
        if (!response.ok || response.redirected) throw new Error(response.redirected ? "Please sign in again." : await response.text());
        setMessage("House artwork saved. Future downloads will use this image."); router.refresh();
      } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed."); }
      finally { setBusy(false); }
    }}><label className="block text-sm">House artwork (PNG or JPEG, up to 3 MB)<input required type="file" name="artwork" accept="image/png,image/jpeg" disabled={busy || !ready} className="mt-2 block max-w-full" onChange={event=>{
      const next=event.target.files?.[0]; setArea(null); setCrop({x:0,y:0}); setZoom(1); setSize({width:0,height:0}); setMessage("");
      if (!next || next.size>3_000_000 || !["image/png","image/jpeg"].includes(next.type)) {setFile(null);setSrc("");setMessage("Choose a PNG or JPEG smaller than 3 MB.");return;}
      setFile(next); setSrc(URL.createObjectURL(next));
    }} /></label>
    {src && <>
      <div className="relative h-72 w-full overflow-hidden rounded-lg bg-ink" aria-label="House artwork crop editor">
        <Cropper key={src} image={src} crop={crop} zoom={zoom} aspect={2990/2086} minZoom={1} maxZoom={4}
          onCropChange={value=>{if(!busy)setCrop(value);}} onZoomChange={value=>{if(!busy)setZoom(value);}}
          onCropComplete={(_,pixels)=>setArea(pixels)} onMediaLoaded={media=>setSize({width:media.naturalWidth,height:media.naturalHeight})} />
      </div>
      <label className="block text-sm">House artwork zoom<input aria-label="House artwork zoom" type="range" min="1" max="4" step="0.01" value={zoom} disabled={busy} onChange={e=>setZoom(Number(e.target.value))} className="block w-full" /></label>
      <p className="text-sm text-muted">Drag the image or use arrow keys in the crop editor to reposition it. The preview below shows the saved panel.</p>
      {area && size.width>0 && <div className="w-full max-w-sm overflow-hidden border border-line" style={{aspectRatio:"2990 / 2086",background:"#f4f2ec"}}>
        <CroppedImage src={src} imageWidth={size.width} imageHeight={size.height} crop={area} alt="Final house crop preview" />
      </div>}
      {area && !valid && <p role="alert">Zoom out or use a larger image. The crop needs at least 1122 × 783 pixels.</p>}
    </>}
    <Button type="submit" disabled={busy || !valid}>{busy ? "Saving…" : updatedAt ? "Replace artwork" : "Save house artwork"}</Button>
    {message && <p role="status">{message}</p>}</form></Card>;
}
