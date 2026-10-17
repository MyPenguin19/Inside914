import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { HoldSelectionResult } from "@/app/(public)/actions/booking";
import { PostcardBooking } from "@/components/booking/postcard-booking";
import { catalog, pairs } from "./fixtures/catalog";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  push.mockReset();
});

function setup(result: HoldSelectionResult = { ok: true }) {
  const holdSelection = vi.fn(async () => result);
  render(<PostcardBooking catalog={catalog} holdSelection={holdSelection} />);
  const position = (label: string) =>
    screen.getAllByRole("button").find((b) => b.getAttribute("data-slot-label") === label)!;
  const holdButton = () => screen.getByRole("button", { name: /hold this position/i });
  return { holdSelection, position, holdButton };
}

describe("PostcardBooking", () => {
  test("shows both sides with open and reserved positions from the catalog", () => {
    const { position } = setup();
    expect(screen.getByRole("group", { name: "Front of the postcard" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Back of the postcard" })).toBeTruthy();
    expect(position("F1").hasAttribute("disabled")).toBe(false);
    expect(position("F4").hasAttribute("disabled")).toBe(true);
    expect(position("F4").getAttribute("aria-label")).toMatch(/Reserved/);
  });

  test("selecting an open position shows it and the $500 standard price", () => {
    const { position, holdButton } = setup();
    expect(holdButton().hasAttribute("disabled")).toBe(true);

    fireEvent.click(position("F3"));
    expect(position("F3").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Front · F3")).toBeTruthy();
    expect(screen.getByTestId("total-price").textContent).toBe("$500");
    expect(holdButton().hasAttribute("disabled")).toBe(false);
  });

  test("a reserved position can't be selected", () => {
    const { position, holdButton } = setup();
    fireEvent.click(position("F4"));
    expect(position("F4").getAttribute("aria-pressed")).toBe("false");
    expect(holdButton().hasAttribute("disabled")).toBe(true);
  });

  test("double size selects a side-by-side pair for $900 and blocks units without a free neighbor", () => {
    const { position } = setup();
    fireEvent.click(screen.getByRole("radio", { name: /double/i }));

    expect(position("F3").hasAttribute("disabled")).toBe(true); // F4 is reserved
    expect(position("F3").getAttribute("aria-label")).toMatch(/Single only/);

    fireEvent.click(position("F2"));
    expect(position("F1").getAttribute("aria-pressed")).toBe("true");
    expect(position("F2").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Front · F1 + F2")).toBeTruthy();
    expect(screen.getByTestId("total-price").textContent).toBe("$900");
  });

  test("the customer can change their selection before holding", () => {
    const { position } = setup();
    fireEvent.click(position("F1"));
    fireEvent.click(position("F3"));
    expect(position("F1").getAttribute("aria-pressed")).toBe("false");
    expect(position("F3").getAttribute("aria-pressed")).toBe("true");
  });

  test("holds the exact selection and moves on to the hold page", async () => {
    const { position, holdButton, holdSelection } = setup({ ok: true });
    fireEvent.click(screen.getByRole("radio", { name: /double/i }));
    fireEvent.click(position("F1"));
    fireEvent.click(holdButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/book/hold"));
    expect(holdSelection).toHaveBeenCalledWith({ editionId: catalog.id, slotIds: ["f1", "f2"] });
  });

  test("when another business takes the position first, says so and redraws availability", async () => {
    const { position, holdButton } = setup({
      ok: false,
      reason: "slot_unavailable",
      availability: { slots: { f1: false, f2: true, f3: true, f4: false, b1: false, b2: false }, pairs },
    });
    fireEvent.click(position("F1"));
    fireEvent.click(holdButton());

    const alert = await screen.findByRole("alert", {}, { timeout: 3000 }); // generous under full-suite load
    expect(within(alert).getByText(/another business just reserved/i)).toBeTruthy();
    expect(position("F1").hasAttribute("disabled")).toBe(true);
    expect(holdButton().hasAttribute("disabled")).toBe(true); // selection cleared
    expect(push).not.toHaveBeenCalled();
  });

  test("a service error never pretends the hold succeeded", async () => {
    const { position, holdButton } = setup({ ok: false, reason: "error" });
    fireEvent.click(position("F1"));
    fireEvent.click(holdButton());
    expect(await screen.findByText(/nothing was reserved/i)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});
