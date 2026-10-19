"use client";

import { PostcardSide, type SlotView } from "@/components/postcard/postcard-side";

// Read-only inventory map: the same postcard component customers use, with every space disabled
// and labeled by who holds it. No second layout engine.
export function PostcardMap({ side, views, dimensions }: { dimensions?: { width: number; height: number }; side: "front" | "back"; views: SlotView[] }) {
  return <PostcardSide dimensions={dimensions} side={side} views={views} priceCents={null} onSelect={() => {}} caption />;
}
