"use client";

import { useState } from "react";

// A failed signed URL is not proof that an original was deleted. Never change review state here.
export function OriginalArtwork({ src }: { src: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <figure className="flex flex-col gap-2">
    <figcaption className="text-sm font-medium">Original upload</figcaption>
    {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL, original aspect ratio */}
    <img src={src} alt="Original advertiser artwork" className="max-h-80 w-full object-contain" onError={() => setFailedUrl(src)} onLoad={() => setFailedUrl(null)} />
    {failedUrl === src && <p role="alert" className="text-sm text-warning">Original preview unavailable. Reload to renew the private link. If it still fails, verify the source file before approving artwork.</p>}
  </figure>;
}
