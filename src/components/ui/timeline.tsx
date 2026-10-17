import type { ReactNode } from "react";

export type TimelineStep = {
  title: string;
  description?: ReactNode;
  state: "done" | "current" | "upcoming";
  meta?: string;
};

// Vertical progress timeline (campaign tracking, admin progress).
export function Timeline({ steps, label }: { steps: TimelineStep[]; label: string }) {
  return (
    <ol aria-label={label} className="relative">
      {steps.map((step, i) => (
        <li key={step.title} aria-current={step.state === "current" ? "step" : undefined} className="relative flex gap-4 pb-7 last:pb-0">
          {i < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={`absolute left-[11px] top-7 h-[calc(100%-1.5rem)] w-px ${step.state === "done" ? "bg-accent" : "bg-line"}`}
            />
          )}
          <span
            aria-hidden="true"
            className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
              step.state === "done"
                ? "bg-accent text-white"
                : step.state === "current"
                  ? "border-2 border-accent bg-surface text-accent"
                  : "border border-line bg-surface text-muted"
            }`}
          >
            {step.state === "done" ? "✓" : i + 1}
          </span>
          <div className="min-w-0">
            <p className={`font-medium ${step.state === "upcoming" ? "text-muted" : ""}`}>
              {step.title}
              <span className="sr-only">
                {step.state === "done" ? " (complete)" : step.state === "current" ? " (in progress)" : " (not started)"}
              </span>
            </p>
            {step.meta && <p className="text-xs text-muted">{step.meta}</p>}
            {step.description && <div className="mt-1 text-sm text-muted">{step.description}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
