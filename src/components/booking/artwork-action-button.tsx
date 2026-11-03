"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function ArtworkActionButton({ children, secondary = false, ariaLabel }: { children: React.ReactNode; secondary?: boolean; ariaLabel?: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={secondary ? "secondary" : "primary"} disabled={pending} aria-label={pending ? "Opening artwork…" : ariaLabel} className="w-full">
    {pending ? "Opening artwork…" : children}
  </Button>;
}
