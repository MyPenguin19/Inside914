"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { holdSecondsLeft } from "@/lib/booking/selection";

// Live "14:32 left" for a hold; refreshes the page once it runs out so the expired state shows.
export function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(() => holdSecondsLeft(expiresAt));

  useEffect(() => {
    const timer = setInterval(() => {
      const left = holdSecondsLeft(expiresAt);
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(timer);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, router]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  return (
    <span>
      <span className="font-mono tabular-nums">
        {minutes}:{seconds}
      </span>{" "}
      left
    </span>
  );
}
