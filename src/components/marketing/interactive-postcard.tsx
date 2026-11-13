"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Only the flip control needs client state; the two sample faces render on the server. */
export function InteractivePostcard({ front, back }: { front: ReactNode; back: ReactNode }) {
  const [showBack, setShowBack] = useState(false);
  const postcardId = useId();

  return (
    <figure aria-label="Interactive sample card" className="mx-auto w-full min-w-0 max-w-[500px]">
      <div id={postcardId} className="[perspective:1200px]">
        <div
          className="grid transition-transform duration-500 ease-in-out [transform-style:preserve-3d] motion-reduce:transition-none"
          style={{ transform: showBack ? "rotateY(180deg)" : "rotateY(0deg)" }}
        >
          <div aria-hidden={showBack} inert={showBack} className="min-w-0 [backface-visibility:hidden] [grid-area:1/1]">
            {front}
          </div>
          <div aria-hidden={!showBack} inert={!showBack} className="min-w-0 [backface-visibility:hidden] [grid-area:1/1] [transform:rotateY(180deg)]">
            {back}
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" aria-atomic="true" className="text-xs text-muted">
          <span className="block font-medium text-foreground">{showBack ? "Back side" : "Front side"}</span>
          <span className="mt-1 block">{showBack ? "Four ads + mailing panel" : "Six advertising spaces"}</span>
        </p>
        <Button variant="secondary" aria-controls={postcardId} aria-pressed={showBack} onClick={() => setShowBack(current => !current)} className="min-h-11">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M20 7v5h-5" />
            <path d="M20 12a8 8 0 1 0-2.3 5.7M20 12a8 8 0 0 0-2.3-5.7L20 7" />
          </svg>
          {showBack ? "View front" : "Flip postcard"}
        </Button>
      </div>
      <figcaption className="mt-4 text-center text-xs leading-relaxed text-muted">
        Sample artwork · Layout varies by campaign
      </figcaption>
    </figure>
  );
}
