"use client";

import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";

// Hidden while someone is already reserving: one obvious next step per screen.
const FOCUSED = /^\/(areas|demo\/(areas|postcard|artwork|checkout)|book\/|editions\/)/;

export function HeaderCta() {
  const pathname = usePathname();
  if (FOCUSED.test(pathname)) return null;
  return (
    <div className="hidden sm:block">
      <ButtonLink href="/areas">Reserve Your Spot</ButtonLink>
    </div>
  );
}
