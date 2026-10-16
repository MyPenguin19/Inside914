// Browser-only helpers for the upload step. The server re-validates everything.
import { checkUpload, MIN_IMAGE_PIXELS, type ArtworkType, type UploadProblem } from "./rules";

export type InspectedFile =
  | { ok: true; type: ArtworkType; width: number; height: number; previewUrl: string }
  | { ok: false; problem: UploadProblem | "corrupt" | "too_small" };

// Checks the file's real signature and size, then decodes it to read its displayed size.
export async function inspectFile(file: File): Promise<InspectedFile> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const basic = checkUpload(file.size, head);
  if (!basic.ok) return { ok: false, problem: basic.problem };

  const previewUrl = URL.createObjectURL(file);
  try {
    const { width, height } = await decode(previewUrl);
    if (Math.min(width, height) < MIN_IMAGE_PIXELS) {
      URL.revokeObjectURL(previewUrl);
      return { ok: false, problem: "too_small" };
    }
    return { ok: true, type: basic.type, width, height, previewUrl };
  } catch {
    URL.revokeObjectURL(previewUrl);
    return { ok: false, problem: "corrupt" };
  }
}

function decode(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("decode failed"));
    img.src = url;
  });
}

export type UploadOptions = { onProgress?: (fraction: number) => void; signal?: AbortSignal };

// PUTs the file to a single-use signed Storage URL (same format as supabase-js
// uploadToSignedUrl) using XHR so we can report progress. Never overwrites (x-upsert: false).
export function uploadToSignedUrl(url: string, file: File, type: ArtworkType, options: UploadOptions = {}) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("upload interrupted"));
    xhr.onabort = () => reject(new Error("upload cancelled"));
    options.signal?.addEventListener("abort", () => xhr.abort());

    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", new Blob([file], { type }));
    xhr.send(body);
  });
}
