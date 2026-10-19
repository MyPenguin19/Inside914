import { describe, expect, test } from "vitest";
import { adminErrorMessage, parseExtendDeadlineForm } from "@/lib/admin/campaign-form";

const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};

describe("extend-deadline form", () => {
  test("converts Westchester time to UTC and keeps only the dates given", () => {
    expect(parseExtendDeadlineForm(form({ reservation_deadline: "2027-01-10T23:59", artwork_due_at: "", mailing_window_start: "" }))).toEqual({
      ok: true,
      payload: { reservation_deadline: "2027-01-11T04:59:00.000Z" }, // EST is UTC-5
    });
    expect(
      parseExtendDeadlineForm(
        form({ reservation_deadline: "2027-01-10T23:59", artwork_due_at: "2027-01-12T17:00", mailing_window_start: "2027-01-20", mailing_window_end: "2027-01-25" }),
      ),
    ).toEqual({
      ok: true,
      payload: {
        reservation_deadline: "2027-01-11T04:59:00.000Z",
        artwork_due_at: "2027-01-12T22:00:00.000Z",
        mailing_window_start: "2027-01-20",
        mailing_window_end: "2027-01-25",
      },
    });
  });

  test("explains a missing or invalid date", () => {
    expect(parseExtendDeadlineForm(form({}))).toEqual({ ok: false, message: "Choose the new reservation deadline." });
    expect(parseExtendDeadlineForm(form({ reservation_deadline: "2027-01-10T23:59", artwork_due_at: "soon" }))).toMatchObject({ ok: false });
    expect(parseExtendDeadlineForm(form({ reservation_deadline: "2027-01-10T23:59", mailing_window_end: "Jan 25" }))).toMatchObject({ ok: false });
  });

  test("the new database refusals read as plain sentences", () => {
    expect(adminErrorMessage({ message: "not_full" })).toMatch(/Every sellable space must be reserved/);
    expect(adminErrorMessage({ message: "campaign_is_full" })).toMatch(/fully reserved/);
    expect(adminErrorMessage({ message: "deadline_must_be_later" })).toMatch(/later than the current one/);
    expect(adminErrorMessage({ message: "cannot_extend_from_printed" })).toBe("A campaign that's printed can't get a new deadline.");
  });
});
