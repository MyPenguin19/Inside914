import { expect, test } from "vitest";
import { PlanInput, scheduledMonths } from "@/lib/recurring/schedule";
const p = {
  name: "Quarterly",
  sources: ["00000000-0000-4000-8000-000000000001"],
  startMonth: "2027-11",
  endMonth: "2028-08",
  interval: 3,
};
test("monthly and quarterly schedules cross year and leap-year boundaries without day drift", () => {
  expect(
    scheduledMonths({
      start_month: "2027-11-01",
      end_month: "2028-08-01",
      interval_months: 3,
    }),
  ).toEqual(["2027-11-01", "2028-02-01", "2028-05-01", "2028-08-01"]);
  expect(
    scheduledMonths({
      start_month: "2028-01-01",
      end_month: "2028-03-01",
      interval_months: 1,
    }),
  ).toEqual(["2028-01-01", "2028-02-01", "2028-03-01"]);
});
test("rejects empty, duplicate or more than four areas, invalid months and unbounded schedules", () => {
  expect(PlanInput.safeParse(p).success).toBe(true);
  for (const override of [
    { sources: [] },
    { sources: [p.sources[0], p.sources[0]] },
    { sources: Array(5).fill(p.sources[0]) },
    { startMonth: "2027-13" },
    { endMonth: "2027-10" },
    { endMonth: "2029-11" },
    { interval: 0 },
    { name: " " },
  ])
    expect(PlanInput.safeParse({ ...p, ...override }).success).toBe(false);
});
