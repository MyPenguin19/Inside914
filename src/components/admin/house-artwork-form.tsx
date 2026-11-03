"use client";
/* Private authenticated/blob images must bypass the public image optimizer. */
/* eslint-disable @next/next/no-img-element */
import { PRINT_DPI, POSTCARD_LAYOUT_V2, placementDimensions } from "@/lib/print/layouts";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Cropper, { type Area } from "react-easy-crop";
import { cropKey, isUsableCrop, roundCrop } from "@/lib/artwork/rules";
import { CroppedImage } from "@/components/artwork/cropped-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const panel = POSTCARD_LAYOUT_V2.housePanel;
const output = { width: Math.round(panel.width * PRINT_DPI), height: Math.round(panel.height * PRINT_DPI) };
const minimum = { width: Math.ceil(panel.width * 300), height: Math.ceil(panel.height * 300) };
const aspect = output.width / output.height;

export function HouseArtworkForm({ updatedAt }: { updatedAt: string | null }) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const input = useRef<HTMLInputElement>(null);
  const [savedVersion, setSavedVersion] = useState<string | null>(null);
  const version = savedVersion ?? updatedAt;
  const [phase, setPhase] = useState<"idle" | "saving" | "verifying">("idle");
  const busy = phase !== "idle";
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onAreaChange = useCallback((_: Area, pixels: Area) => {
    const rounded = roundCrop(pixels);
    if (!isUsableCrop(rounded)) return;
    setArea(previous => previous && cropKey(previous) === cropKey(rounded) ? previous : rounded);
  }, []);
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  const valid = !!area && area.width >= minimum.width && area.height >= minimum.height;
  const sourceTooSmall = size.width > 0 && (size.width < minimum.width || size.height < minimum.height);
  const reset = () => { setCrop({ x: 0, y: 0 }); setZoom(1); };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !file || !valid) return;
    const data = new FormData();
    data.set("artwork", file); data.set("crop", JSON.stringify(area)); data.set("layoutKey", POSTCARD_LAYOUT_V2.key);
    data.set("baseUpdatedAt", version ?? "");
    setPhase("saving"); setMessage("");
    try {
      const response = await fetch("/admin/house-artwork", { method: "POST", body: data });
      if (!response.ok || response.redirected) throw new Error(response.redirected ? "Please sign in again." : await response.text());
      const result = await response.json();
      if (result.ok !== true || typeof result.version !== "string") throw new Error("Could not confirm the save. Reopen Settings to check it.");
      setPhase("verifying");
      const check = await fetch(`/admin/house-artwork?verify=${encodeURIComponent(result.version)}`, { cache: "no-store" });
      if (!check.ok || check.redirected || check.headers.get("X-House-Artwork-Version") !== result.version) {
        throw new Error("The upload was accepted, but the saved preview could not be verified. Reopen Settings to check it.");
      }
      const previewUrl = URL.createObjectURL(await check.blob());
      try {
        const image = new Image(); image.src = previewUrl; await image.decode();
        if (image.naturalWidth !== output.width || image.naturalHeight !== output.height) throw new Error("Unexpected preview size. Reopen Settings to check it.");
      } finally { URL.revokeObjectURL(previewUrl); }
      setSavedVersion(result.version); setFile(null); setSrc(""); setArea(null);
      if (input.current) input.current.value = "";
      setMessage("House artwork saved and verified. Future downloads use this image. Review a new final proof before printing.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The save could not be confirmed. Please retry."); }
    finally { setPhase("idle"); }
  }

  return <Card><h2 className="text-xl font-semibold">Permanent Back-Side House Ad</h2>
    <p className="my-3 text-sm text-muted">Used on future downloads for every campaign. Replacing it requires a new final proof.</p>
    {version ? <img src={`/admin/house-artwork?v=${encodeURIComponent(version)}`} alt="Current permanent house advertisement" className="mb-4 w-full max-w-sm rounded-lg border border-line" /> : <p className="mb-4">No house artwork saved yet.</p>}
    <form className="space-y-3" onSubmit={save}>
      <Button variant="secondary" disabled={busy || !ready} onClick={() => input.current?.click()}>Replace image</Button>
      <input ref={input} type="file" name="artwork" aria-label="House artwork (PNG or JPEG, up to 3 MB)" accept="image/png,image/jpeg" disabled={busy || !ready} className="sr-only" onChange={event => {
        const next = event.target.files?.[0]; if (!next) return;
        setMessage("");
        if (next.size <= 0 || next.size > 3_000_000 || !["image/png", "image/jpeg"].includes(next.type)) {
          setMessage("Choose a PNG or JPEG smaller than 3 MB. Your saved artwork is unchanged."); return;
        }
        setArea(null); reset(); setSize({ width: 0, height: 0 }); setFile(next); setSrc(URL.createObjectURL(next));
      }} />
      <p className="text-sm text-muted">PNG or JPEG, up to 3 MB. V2 panel: {placementDimensions(panel)}. Use an image at least {minimum.width} × {minimum.height} pixels, with extra room if you plan to crop.</p>
      {src && <div className="max-w-[640px] space-y-3">
        <h3 className="font-medium">New image preview</h3>
        <div className="relative w-full overflow-hidden rounded-xl ring-1 ring-inset ring-line bg-[#f4f2ec]" style={{ aspectRatio: aspect }} aria-label="House artwork crop editor">
          <Cropper key={src} image={src} crop={crop} zoom={zoom} aspect={aspect} minZoom={1} maxZoom={4} objectFit="cover" showGrid={false}
            onCropChange={value => { if (!busy) setCrop(value); }} onZoomChange={value => { if (!busy) setZoom(value); }}
            onCropAreaChange={onAreaChange} onCropComplete={onAreaChange}
            onMediaLoaded={media => setSize({ width: media.naturalWidth, height: media.naturalHeight })}
            cropperProps={{ "aria-label": "House artwork. Drag to reposition, or use arrow keys." }} />
        </div>
        <p className="text-xs text-muted">Drag to reposition. Zoom is optional.</p>
        <div className="flex min-w-0 items-center gap-3">
          <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">Zoom<input aria-label="House artwork zoom" type="range" min="1" max="4" step="0.01" value={zoom} disabled={busy} onChange={e => setZoom(Number(e.target.value))} className="h-11 min-w-0 flex-1 accent-[var(--accent)]" /></label>
          <Button variant="secondary" onClick={reset} disabled={busy}>Reset</Button>
        </div>
        {size.width > 0 && <p className="text-xs text-muted">Original: {size.width} × {size.height} pixels. Selected crop: {area?.width ?? "…"} × {area?.height ?? "…"} pixels.</p>}
        {area && size.width > 0 && <details><summary className="cursor-pointer text-sm">Final panel preview</summary><div className="mt-2 w-full max-w-sm overflow-hidden border border-line" style={{ aspectRatio: aspect }}><CroppedImage src={src} imageWidth={size.width} imageHeight={size.height} crop={area} alt="Final house crop preview" /></div></details>}
        {area && !valid && <p role="alert" className="text-sm text-warning">{sourceTooSmall
          ? `This original is too small for sharp printing. Upload a larger version, at least ${minimum.width} × ${minimum.height} pixels. Zooming out cannot add missing detail.`
          : `This crop is too small for sharp printing. Choose Reset or zoom out to keep at least ${minimum.width} × ${minimum.height} pixels.`}</p>}
        <Button size="lg" type="submit" className="w-full sm:w-auto" disabled={busy || !valid}>{phase === "saving" ? "Uploading and saving…" : phase === "verifying" ? "Verifying saved image…" : "Save house artwork"}</Button>
      </div>}
      {busy && <p role="status">{phase === "saving" ? "Uploading your original and preparing the print image…" : "Checking the saved version…"}</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </form>
  </Card>;
}
