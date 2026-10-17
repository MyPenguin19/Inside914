"use client";

import { PostcardSide, type SlotView } from "@/components/postcard/postcard-side";

// Read-only inventory map: the same postcard component customers use, with every space disabled
// and labeled by who holds it. No second layout engine.
export function PostcardMap({ side, views }: { side: "front" | "back"; views: SlotView[] }) {
  return <PostcardSide side={side} views={views} priceCents={null} onSelect={() => {}} caption />;
}
