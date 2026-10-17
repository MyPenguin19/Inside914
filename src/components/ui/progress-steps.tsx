// Where you are in a multi-step flow. Phones get a compact "Step 2 of 4" bar; wider screens see
// every step. `current` is 1-based.
export function ProgressSteps({ steps, current, label }: { steps: readonly string[]; current: number; label: string }) {
  return (
    <nav aria-label={label}>
      <div className="sm:hidden">
        <p className="text-sm">
          <span className="text-muted">
            Step {current} of {steps.length}:
          </span>{" "}
          <span className="font-medium">{steps[current - 1]}</span>
        </p>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          {steps.map((step, i) => (
            <span key={step} className={`h-1 flex-1 rounded-full ${i < current ? "bg-accent" : "bg-line"}`} />
          ))}
        </div>
      </div>
      <ol className="hidden gap-2 sm:flex">
        {steps.map((step, i) => {
          const n = i + 1;
          const state = n < current ? "done" : n === current ? "current" : "todo";
          return (
            <li key={step} aria-current={state === "current" ? "step" : undefined} className="flex flex-1 flex-col gap-2">
              <span aria-hidden="true" className={`h-1 rounded-full ${state === "todo" ? "bg-line" : "bg-accent"}`} />
              <span className={`flex items-center gap-1.5 text-sm ${state === "todo" ? "text-muted" : "font-medium"}`}>
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    state === "todo" ? "border border-line-strong text-muted" : state === "done" ? "bg-accent text-white" : "bg-foreground text-background"
                  }`}
                >
                  {state === "done" ? "✓" : n}
                </span>
                {step}
                {state === "done" && <span className="sr-only"> (done)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
