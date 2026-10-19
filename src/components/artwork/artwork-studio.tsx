"use client";

import { bookingSizeLabel, positionLabel } from "@/lib/booking/products";

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
import { formatDeadline, formatPrice } from "@/lib/format";
import { PRINT_SPEC } from "@/lib/print/spec";
import type { PostcardZone } from "@/components/postcard/postcard-side";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/primitives";

export type ArtworkActions = {
  requestUpload: (input: { byteSize: number }) => Promise<UploadTicket>;
  finalizeUpload: (input: { artworkId: string }) => Promise<FinalizeResult>;
  saveLayout: (input: { artworkId: string; crop: CropPixels; zoom: number }) => Promise<SimpleResult>;
  removeArtwork: () => Promise<SimpleResult>;
  extendHold: () => Promise<ExtendResult>;
};

type Props = {
  dimensions?: { width: number; height: number };
  reservationMode?: boolean;
  hold: { expiresAt: string; extensionsLeft: number };
  ad: { side: "front" | "back"; area: SlotGeometry; labels: string[]; size: import("@/lib/booking/products").BookingSize; priceCents: number };
  otherSlots: SlotGeometry[];
  initialArtwork: ArtworkView | null;
  actions: ArtworkActions;
  nextHref?: string; // where the continue button goes
  continueLabel?: string;
  restartHref?: string; // where to choose a position again after the hold ends
  zones?: PostcardZone[]; // printed non-ad areas for the preview
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

export function ArtworkStudio({
  dimensions,
  reservationMode = false,
  hold,
  ad,
  otherSlots,
  initialArtwork,
  actions,
  nextHref = "/book/review",
  continueLabel = "Continue to review",
  restartHref = "/areas",
  zones,
  upload = uploadToSignedUrl,
  inspect = inspectFile,
}: Props) {
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
  const safeX = `${(PRINT_SPEC.safeMarginInches / ad.area.width) * 100}%`;
  const safeY = `${(PRINT_SPEC.safeMarginInches / ad.area.height) * 100}%`;
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
      <section aria-labelledby="studio-title" className="flex min-w-0 flex-col gap-3">
        <h2 id="studio-title" className="text-lg font-semibold">
          {image ? "Adjust your ad" : "Upload your ad"}
        </h2>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
          <p>
            {reservationMode ? "Artwork changes close " : "Your position is held for "}
            <strong className="font-mono tabular-nums" suppressHydrationWarning>
              {reservationMode ? formatDeadline(expiresAt) : formatCountdown(secondsLeft)}
            </strong>
          </p>
          {canExtend && (
            <Button variant="secondary" onClick={extend}>
              Need more time? Add 15 minutes
            </Button>
          )}
        </div>

        {expiredNow ? (
          <Notice tone="danger" role="alert">
            {reservationMode ? "The artwork deadline has passed." : "Your hold has ended, so this position may no longer be available."}{" "}
            <Link href={restartHref} className="font-medium underline">
              {reservationMode ? "Return to your reservation" : "Choose your position again"}
            </Link>
            .
          </Notice>
        ) : image ? (
          <div className="flex flex-col gap-3">
            <div
              className="relative w-full overflow-hidden rounded-xl bg-ink"
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
                // Dashed inner line = the safe area: keep words and logos inside it.
                classes={{
                  cropAreaClassName:
                    "after:pointer-events-none after:absolute after:border after:border-dashed after:border-white/85 after:content-[''] after:left-[var(--safe-x)] after:right-[var(--safe-x)] after:top-[var(--safe-y)] after:bottom-[var(--safe-y)]",
                }}
                style={{ cropAreaStyle: { "--safe-x": safeX, "--safe-y": safeY } as React.CSSProperties }}
                keyboardStep={10}
              />
            </div>
            <p className="text-xs text-muted">Drag the image to move it. Keep important words inside the dashed line.</p>
            <div className="flex items-center gap-2">
              <ZoomButton label="Zoom out" onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))} disabled={zoom <= 1}>
                −
              </ZoomButton>
              <label className="flex flex-1 items-center gap-3 text-sm">
                <span className="sr-only">Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="h-11 flex-1 accent-[var(--accent)]"
                  aria-valuetext={`${Math.round(zoom * 100)} percent`}
                />
              </label>
              <ZoomButton label="Zoom in" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.25).toFixed(2)))} disabled={zoom >= MAX_ZOOM}>
                +
              </ZoomButton>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => { setCrop({ x: 0, y: 0 }); setZoom(1); }} disabled={busy}>
                Reset position
              </Button>
              <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
                Replace image
              </Button>
              <Button variant="quiet" onClick={remove} disabled={busy} className="px-3">
                Remove image
              </Button>
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
            className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
              dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-surface"
            }`}
          >
            <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-2xl text-accent">
              ↑
            </span>
            <p className="text-base font-medium">Drag your ad image here, or</p>
            <Button size="lg" onClick={() => fileInput.current?.click()} disabled={busy}>
              Choose an image
            </Button>
            <p className="max-w-sm text-xs text-muted">
              JPG or PNG, up to {formatMegabytes(MAX_UPLOAD_BYTES)}. Use the largest, sharpest version you have; you can
              adjust it next.
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
            <Notice tone={message.tone === "error" ? "danger" : "success"} role={message.tone === "error" ? "alert" : undefined}>
              {message.text}
            </Notice>
          )}
        </div>
      </section>

      <aside aria-labelledby="preview-title" className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
        <h2 id="preview-title" className="text-lg font-semibold">
          Preview
        </h2>
        {/* Sized so the whole card, the quality note and Continue fit on screen together. */}
        <div className="mx-auto w-full max-w-[260px] sm:max-w-[300px] lg:max-w-[min(100%,calc((100svh-24rem)*6.5/12))]">
          <PostcardPreview dimensions={dimensions} side={ad.side} otherSlots={otherSlots} area={ad.area} zones={zones}>
            {image && area ? (
              <CroppedImage src={image.src} imageWidth={image.width} imageHeight={image.height} crop={area} alt="Your ad as it will sit on the postcard" />
            ) : (
              <div className="flex h-full items-center justify-center bg-accent-soft p-2 text-center text-xs text-accent">Your ad</div>
            )}
          </PostcardPreview>
        </div>
        <QualityNote ppi={ppi} level={quality} />
        <p className="text-xs text-muted">
          Keep important words and logos inside the dashed line. This is a{" "}
          <strong className="font-medium text-foreground">provisional preview</strong>, not a print proof: final sizes
          and margins will be confirmed with our printer.
        </p>
        <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <p>
              {positionLabel(ad.size, ad.labels.map(label => ({ label, side: ad.side })))} · {bookingSizeLabel(ad.size)}
            </p>
            <p className="font-display text-2xl font-medium">{formatPrice(ad.priceCents)}</p>
          </div>
          <Button size="lg" onClick={continueToReview} disabled={!image || !area || busy || expiredNow} className="mt-3 w-full">
            {continueLabel}
          </Button>
          {!image && <p className="mt-2 text-center text-xs text-muted">Add an image to continue.</p>}
        </div>
      </aside>
    </div>
  );
}

function ZoomButton({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      {...props}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-xl leading-none hover:border-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function QualityNote({ ppi, level }: { ppi: number | null; level: ReturnType<typeof resolutionLevel> | null }) {
  if (ppi === null || level === null) return null;
  if (level === "good") {
    return <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">✓ Image quality looks good for print.</p>;
  }
  return (
    <p role="status" className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
      {level === "poor"
        ? "This image may look blurry or blocky when printed. A larger, sharper image will look much better."
        : "This image may look slightly soft when printed. If you have a larger version, use that."}{" "}
      <span className="text-xs">
        ({ppi} pixels per inch at this size; we suggest {PRINT_SPEC.recommendedPpi}+.)
      </span>
    </p>
  );
}
