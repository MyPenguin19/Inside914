"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { holdSecondsLeft } from "@/lib/booking/selection";

// Seconds left on a hold, ticking every second; refreshes the page once it runs out so the
// server renders the expired state.
export function useHoldSecondsLeft(expiresAt: string) {
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

  return secondsLeft;
}

export function formatCountdown(secondsLeft: number) {
  return `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;
}

// Live "14:32 left" for a hold.
export function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const secondsLeft = useHoldSecondsLeft(expiresAt);
  return (
    <span>
      {/* The server and browser render a second or two apart; the timer corrects itself. */}
      <span className="font-mono tabular-nums" suppressHydrationWarning>
        {formatCountdown(secondsLeft)}
      </span>{" "}
      left
    </span>
  );
}
