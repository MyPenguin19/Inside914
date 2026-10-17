import Link from "next/link";
import type { ComponentProps } from "react";

// One button style system for the whole site: primary (dark), secondary (outlined), quiet (text),
// inverse (light button on a dark card).
type Variant = "primary" | "secondary" | "quiet" | "inverse";
type Size = "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-foreground text-background hover:bg-accent disabled:bg-line disabled:text-muted",
  secondary: "border border-foreground/80 bg-transparent text-foreground hover:bg-foreground hover:text-background disabled:border-line disabled:text-muted",
  quiet: "text-foreground underline-offset-4 hover:underline disabled:text-muted",
  inverse: "bg-background text-foreground hover:bg-accent-soft disabled:opacity-60",
};
const SIZES: Record<Size, string> = { md: "px-5 py-2.5 text-sm", lg: "px-7 py-3.5 text-base" };

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `${BASE} ${VARIANTS[variant]} ${variant === "quiet" ? "" : SIZES[size]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="button" {...props} className={buttonClass(variant, size, className)} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...props} className={buttonClass(variant, size, className)} />;
}
