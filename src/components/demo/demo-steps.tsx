import { ProgressSteps } from "@/components/ui/progress-steps";

// The design preview's journey: four steps, then the confirmation.
const STEPS = ["Choose area", "Choose space", "Add artwork", "Review & reserve"] as const;

export function DemoSteps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return <ProgressSteps steps={STEPS} current={current} label="Reservation progress" />;
}
