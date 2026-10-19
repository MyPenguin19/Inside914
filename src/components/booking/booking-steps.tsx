import { ProgressSteps } from "@/components/ui/progress-steps";

const STEPS = ["Choose category", "Select zones", "Square artwork", "Business details", "Save card"] as const;

// current: 1-based index of the step the visitor is on.
export function BookingSteps({ current }: { current: 1 | 2 | 3 | 4 | 5 }) {
  return <ProgressSteps steps={STEPS} current={current} label="Booking progress" />;
}
