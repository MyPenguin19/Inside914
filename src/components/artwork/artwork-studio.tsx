"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type DragEvent } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import type { ExtendResult, FinalizeResult, SimpleResult, UploadTicket } from "@/app/(public)/actions/artwork";
import { CroppedImage } from "@/components/artwork/cropped-image";
import { PostcardPreview } from "@/components/artwork/postcard-preview";
import { formatCountdown, useHoldSecondsLeft } from "@/components/booking/hold-countdown";
import { inspectFile, uploadToSignedUrl } from "@/lib/artwork/browser-file";
import {
  effectivePpi,
  formatMegabytes,
  MAX_UPLOAD_BYTES,
  MIN_IMAGE_PIXELS,
  resolutionLevel,
  type CropPixels,
  type SlotGeometry,
} from "@/lib/artwork/rules";
import type { ArtworkFailure, ArtworkView } from "@/lib/artwork/service";
import { formatPrice } from "@/lib/format";
import { PRINT_SPEC } from "@/lib/print/spec";

export type ArtworkActions = {
  requestUpload: (input: { byteSize: number }) => Promise<UploadTicket>;
  finalizeUpload: (input: { artworkId: string }) => Promise<FinalizeResult>;
  saveLayout: (input: { artworkId: string; crop: CropPixels; zoom: number }) => Promise<SimpleResult>;
  removeArtwork: () => Promise<SimpleResult>;
  extendHold: () => Promise<ExtendResult>;
};

type Props = {
  hold: { expiresAt: string; extensionsLeft: number };
  ad: { side: "front" | "back"; area: SlotGeometry; labels: string[]; size: "standard" | "double"; priceCents: number };
  otherSlots: SlotGeometry[];
  initialArtwork: ArtworkView | null;
  actions: ArtworkActions;
  nextHref?: string; // where "Continue to review" goes
  upload?: typeof uploadToSignedUrl; // injectable for tests
  inspect?: typeof inspectFile;
};

type StudioImage = { id: string; src: string; width: number; height: number };
type Phase = "idle" | "checking" | "uploading" | "verifying" | "saving";
type Message = { tone: "error" | "info"; text: string };

const MAX_ZOOM = 4;
const EXTEND_WINDOW_SECONDS = 5 * 60;

const PROBLEM_TEXT: Record<ArtworkFailure | "interrupted", string> = {
  empty: "That file is empty. Please choose another image.",
  too_large: `That file is larger than ${formatMegabytes(MAX_UPLOAD_BYTES)}. Please choose a smaller image.`,
  unsupported_type: "Please choose a JPG or PNG image. Other formats (like PDF or HEIC) aren't supported yet.",
  corrupt: "We couldn't open that image. It may be damaged, so try saving or exporting it again.",
  too_small: `That image is too small (under ${MIN_IMAGE_PIXELS} pixels on a side). Please use a larger image.`,
  upload_missing: "The upload didn't finish. Please try again.",
  interrupted: "The upload was interrupted, so nothing was saved. Check your connection and try again.",
  not_found: "Something went wrong with that upload. Please try again.",
  no_hold: "Your hold has ended. Please go back and choose your position again.",
  hold_expired: "Your hold has ended. Please go back and choose your position again.",
  invalid_input: "That didn't work. Please try again.",
  error: "Something went wrong on our side and your image wasn't saved. Please try again in a moment.",
};

export function ArtworkStudio({ hold, ad, otherSlots, initialArtwork, actions, nextHref = "/book/review", upload = uploadToSignedUrl, inspect = inspectFile }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<StudioImage | null>(
    initialArtwork
      ? { id: initialArtwork.id, src: initialArtwork.viewUrl, width: initialArtwork.width, height: initialArtwork.height }
      : null,
  );
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(initialArtwork?.zoom ?? 1);
  const [area, setArea] = useState<CropPixels | null>(initialArtwork?.crop ?? null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<Message | null>(null);
  const [dragging, setDragging] = useState(false);
  const [expiresAt, setExpiresAt] = useState(hold.expiresAt);
  const [extensionsLeft, setExtensionsLeft] = useState(hold.extensionsLeft);
  const [holdLost, setHoldLost] = useState(false);
  const secondsLeft = useHoldSecondsLeft(expiresAt);

  const busy = phase !== "idle";
  const aspect = ad.area.width / ad.area.height;
  const ppi = area ? effectivePpi(area, ad.area) : null;
  const quality = ppi === null ? null : resolutionLevel(ppi);

  function fail(reason: ArtworkFailure | "interrupted") {
    if (reason === "no_hold" || reason === "hold_expired") setHoldLost(true);
    setMessage({ tone: "error", text: PROBLEM_TEXT[reason] });
  }

  async function handleFile(file: File) {
    setMessage(null);
    setPhase("checking");
    try {
      const inspected = await inspect(file);
      if (!inspected.ok) return fail(inspected.problem);

      const ticket = await actions.requestUpload({ byteSize: file.size });
      if (!ticket.ok) return fail(ticket.reason);
      setImage(null); // the previous image (if any) was replaced on the server

      setPhase("uploading");
      setProgress(0);
      try {
        await upload(ticket.uploadUrl, file, inspected.type, { onProgress: setProgress });
      } catch {
        await actions.removeArtwork(); // drop the half-finished upload record
        return fail("interrupted");
      }

      setPhase("verifying");
      const result = await actions.finalizeUpload({ artworkId: ticket.artworkId });
      if (!result.ok) return fail(result.reason);

      setImage({ id: result.artwork.id, src: inspected.previewUrl, width: result.artwork.width, height: result.artwork.height });
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setArea(null);
      setMessage({ tone: "info", text: "Image uploaded. Drag it and zoom until it looks right." });
    } catch {
      fail("error");
    } finally {
      setPhase("idle");
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function remove() {
    setPhase("saving");
    const result = await actions.removeArtwork();
    setPhase("idle");
    if (!result.ok) return fail(result.reason);
    setImage(null);
    setArea(null);
    setMessage({ tone: "info", text: "Image removed." });
  }

  async function extend() {
    const result = await actions.extendHold();
    if (result.ok) {
      setExpiresAt(result.expiresAt);
      setExtensionsLeft((n) => n - 1);
      setMessage({ tone: "info", text: "Done: you have 15 more minutes." });
    } else if (result.reason === "no_hold" || result.reason === "hold_expired") {
      fail("hold_expired");
    } else {
      setMessage({
        tone: "error",
        text:
          result.reason === "extension_limit"
            ? "You've used all your extra time for this hold."
            : result.reason === "extension_too_early"
              ? "You can add more time once there are 5 minutes or less left."
              : "We couldn't add more time just now. Please try again.",
      });
    }
  }

  async function continueToReview() {
    if (!image || !area) return;
    setPhase("saving");
    const rounded = {
      x: Math.round(area.x),
      y: Math.round(area.y),
      width: Math.round(area.width),
      height: Math.round(area.height),
    };
    const result = await actions.saveLayout({ artworkId: image.id, crop: rounded, zoom });
    // Next keeps this page's state for back-navigation, so leave it idle (not "saving").
    setPhase("idle");
    if (!result.ok) return fail(result.reason);
    router.push(nextHref);
  }

  const onAreaChange = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !busy) void handleFile(file);
  }

  const expiredNow = holdLost || secondsLeft === 0;
  const canExtend = !expiredNow && extensionsLeft > 0 && secondsLeft <= EXTEND_WINDOW_SECONDS;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-labelledby="studio-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
          <p>
            Your position is held for{" "}
            <strong className="font-mono tabular-nums" suppressHydrationWarning>
              {formatCountdown(secondsLeft)}
            </strong>
          </p>
          {canExtend && (
            <button type="button" onClick={extend} className="rounded-full border border-foreground px-3 py-1 font-medium hover:bg-foreground hover:text-background">
              Need more time? Add 15 minutes
            </button>
          )}
        </div>

        <h2 id="studio-title" className="text-lg font-semibold">
          {image ? "Adjust your ad" : "Upload your ad"}
        </h2>

        {expiredNow ? (
          <p role="alert" className="rounded-xl bg-[#fbeceb] px-4 py-3 text-sm text-danger">
            Your hold has ended, so this position may no longer be available.{" "}
            <Link href="/#editions" className="font-medium underline">
              Choose your position again
            </Link>
            .
          </p>
        ) : image ? (
          <div className="flex flex-col gap-3">
            <div
              className="relative w-full overflow-hidden rounded-xl bg-[#2b2a27]"
              style={{ aspectRatio: aspect >= 1 ? `${aspect} / 1` : "1 / 1", maxHeight: 480 }}
            >
              <Cropper
                image={image.src}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                maxZoom={MAX_ZOOM}
                objectFit="contain" // start from the largest crop the image allows
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropAreaChange={onAreaChange}
                onCropComplete={onAreaChange}
                initialCroppedAreaPixels={initialArtwork?.id === image.id ? (initialArtwork.crop ?? undefined) : undefined}
                cropperProps={{ "aria-label": "Your ad. Drag to move it, or use the arrow keys." }}
                keyboardStep={10}
              />
            </div>
            <label className="flex items-center gap-3 text-sm">
              <span className="w-12 font-medium">Zoom</span>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-[var(--accent)]"
                aria-valuetext={`${Math.round(zoom * 100)} percent`}
              />
            </label>
            <div className="flex flex-wrap gap-2 text-sm">
              <StudioButton onClick={() => { setCrop({ x: 0, y: 0 }); setZoom(1); }} disabled={busy}>
                Reset
              </StudioButton>
              <StudioButton onClick={() => fileInput.current?.click()} disabled={busy}>
                Replace image
              </StudioButton>
              <StudioButton onClick={remove} disabled={busy}>
                Remove image
              </StudioButton>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center ${
              dragging ? "border-accent bg-accent-soft" : "border-line bg-surface"
            }`}
          >
            <p className="text-base font-medium">Drag your ad image here</p>
            <p className="text-sm text-muted">or</p>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-accent disabled:bg-line disabled:text-muted"
            >
              Choose an image
            </button>
            <p className="text-xs text-muted">
              JPG or PNG, up to {formatMegabytes(MAX_UPLOAD_BYTES)}. Use the largest, sharpest version you have.
            </p>
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png"
          className="sr-only"
          tabIndex={-1}
          aria-label="Ad image file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />

        <div aria-live="polite" className="min-h-6 text-sm">
          {phase === "checking" && <p>Checking your image…</p>}
          {phase === "uploading" && (
            <div className="flex items-center gap-3">
              <progress max={1} value={progress} className="h-2 flex-1 accent-[var(--accent)]" aria-label="Upload progress" />
              <span className="w-12 tabular-nums">{Math.round(progress * 100)}%</span>
            </div>
          )}
          {phase === "verifying" && <p>Almost done: making sure your image is print-ready…</p>}
          {phase === "saving" && <p>Saving…</p>}
          {message && phase === "idle" && (
            <p
              role={message.tone === "error" ? "alert" : undefined}
              className={`rounded-lg px-3 py-2 ${message.tone === "error" ? "bg-[#fbeceb] text-danger" : "bg-accent-soft text-accent"}`}
            >
              {message.text}
            </p>
          )}
        </div>
      </section>

      <aside aria-labelledby="preview-title" className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <h2 id="preview-title" className="text-lg font-semibold">
          Preview
        </h2>
        <PostcardPreview side={ad.side} otherSlots={otherSlots} area={ad.area}>
          {image && area ? (
            <CroppedImage src={image.src} imageWidth={image.width} imageHeight={image.height} crop={area} alt="Your ad as it will sit on the postcard" />
          ) : (
            <div className="flex h-full items-center justify-center bg-accent-soft p-2 text-center text-xs text-accent">Your ad</div>
          )}
        </PostcardPreview>
        <QualityNote ppi={ppi} level={quality} />
        <p className="text-xs text-muted">
          Keep important words and logos inside the dashed line. This is a{" "}
          <strong className="font-medium text-foreground">provisional preview</strong>, not a print proof: final sizes
          and margins will be confirmed with our printer.
        </p>
        <div className="rounded-xl border border-line bg-surface p-4 text-sm">
          <p>
            {ad.side === "front" ? "Front" : "Back"} · {ad.labels.join(" + ")} ·{" "}
            {ad.size === "double" ? "Double" : "Standard"}
          </p>
          <p className="mt-1 text-lg font-semibold">{formatPrice(ad.priceCents)}</p>
          <button
            type="button"
            onClick={continueToReview}
            disabled={!image || !area || busy || expiredNow}
            className="mt-3 w-full rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background hover:bg-accent disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
          >
            Continue to review
          </button>
        </div>
      </aside>
    </div>
  );
}

function StudioButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="rounded-full border border-line px-4 py-2 hover:border-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function QualityNote({ ppi, level }: { ppi: number | null; level: ReturnType<typeof resolutionLevel> | null }) {
  if (ppi === null || level === null) return null;
  if (level === "good") {
    return <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">Image quality looks good for print.</p>;
  }
  return (
    <p role="status" className="rounded-lg bg-[#fdf4e3] px-3 py-2 text-sm text-[#8a5a00]">
      {level === "poor"
        ? "This image may look blurry or blocky when printed. A larger, sharper image will look much better."
        : "This image may look slightly soft when printed. If you have a larger version, use that."}{" "}
      <span className="text-xs">
        ({ppi} pixels per inch at this size; we suggest {PRINT_SPEC.recommendedPpi}+.)
      </span>
    </p>
  );
}
