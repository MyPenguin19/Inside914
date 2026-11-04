/** Shared wordmark. All dimensions scale with the surrounding font size. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-[0.08em] whitespace-nowrap align-middle font-display font-semibold leading-none tracking-[-0.055em] text-foreground ${className}`}>
      <span>INSIDE</span>{" "}
      {/* Compensate for Geist's unequal outer digit bearings to center the visible numerals. */}
      <span className="border-[0.055em] border-current py-[0.08em] pl-[0.255em] pr-[0.185em] font-sans font-medium leading-none tracking-normal">914</span>
    </span>
  );
}
