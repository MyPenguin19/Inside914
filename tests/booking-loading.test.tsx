import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { AreasLoading, BookingLoading } from "@/components/booking/booking-loading";

afterEach(cleanup);

test("loading areas gives context without presenting bookable inventory or inactive controls", () => {
  render(<AreasLoading />);
  expect(screen.getByRole("navigation", { name: "Booking progress" })).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Checking current prices");
  for (const area of ["Central", "Southern", "Northern", "Eastern"]) {
    expect(screen.getByText(`${area} Westchester`)).toBeTruthy();
  }
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.queryByText(/\$399|Available|Not open/)).toBeNull();
});

test.each([
  { step: 2 as const, title: "Add your artwork", message: "Loading your selected areas…" },
  { step: 3 as const, title: "Your business details", message: "Loading your business details…" },
  { step: 4 as const, title: "Save your card. Pay $0 today.", message: "Preparing your reservation summary…" },
])("step $step remains identifiable while private data loads", props => {
  render(<BookingLoading {...props} />);
  expect(screen.getByRole("heading", { level: 1, name: props.title })).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe(props.message);
  expect(screen.getByRole("navigation", { name: "Booking progress" })).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});
