import { z } from "zod";
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const PlanInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    sources: z
      .array(z.uuid())
      .min(1)
      .max(4)
      .refine((ids) => new Set(ids).size === ids.length),
    startMonth: Month,
    endMonth: Month,
    interval: z.coerce.number().refine((n) => n === 1 || n === 3),
  })
  .refine(
    (p) =>
      monthIndex(p.endMonth) >= monthIndex(p.startMonth) &&
      monthIndex(p.endMonth) - monthIndex(p.startMonth) < 24,
    { message: "Choose an end month within two years of the start." },
  );
export function monthIndex(month: string) {
  const [year, m] = month.slice(0, 7).split("-").map(Number);
  return year * 12 + m - 1;
}
export function scheduledMonths(plan: {
  start_month: string;
  end_month: string;
  interval_months: number;
}) {
  if (![1, 3].includes(plan.interval_months)) return [];
  const result: string[] = [];
  for (
    let n = monthIndex(plan.start_month);
    n <= monthIndex(plan.end_month) && result.length < 24;
    n += plan.interval_months
  ) {
    result.push(
      `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}-01`,
    );
  }
  return result;
}
