const STEPS = ["Choose edition", "Pick your position", "Add your artwork", "Review", "Your details"] as const;

// current: 1-based index of the step the visitor is on.
export function BookingSteps({ current }: { current: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <nav aria-label="Booking progress">
      <ol className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {STEPS.map((step, i) => {
          const n = i + 1;
          const state = n < current ? "done" : n === current ? "current" : "todo";
          return (
            <li key={step} aria-current={state === "current" ? "step" : undefined} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  state === "todo" ? "border border-line text-muted" : "bg-foreground text-background"
                }`}
              >
                {state === "done" ? <span aria-hidden="true">✓</span> : n}
              </span>
              <span className={state === "todo" ? "text-muted" : "font-medium"}>
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
