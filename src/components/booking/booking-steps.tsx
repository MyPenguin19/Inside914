import { ProgressSteps } from "@/components/ui/progress-steps";

const STEPS = ["Choose edition", "Pick your position", "Add your artwork", "Review", "Your details"] as const;

// current: 1-based index of the step the visitor is on.
export function BookingSteps({ current }: { current: 1 | 2 | 3 | 4 | 5 }) {
  return <ProgressSteps steps={STEPS} current={current} label="Booking progress" />;
}
