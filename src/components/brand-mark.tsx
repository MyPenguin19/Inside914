/** Shared wordmark. All dimensions scale with the surrounding font size. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-[0.08em] whitespace-nowrap align-middle font-display font-semibold leading-none tracking-[-0.055em] text-foreground ${className}`}>
      <span>INSIDE</span>{" "}
      <span className="border-[0.055em] border-current px-[0.22em] py-[0.08em] font-sans font-medium leading-[0.9] tracking-[-0.075em]">914</span>
    </span>
  );
}
