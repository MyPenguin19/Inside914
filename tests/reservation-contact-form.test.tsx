import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ContactForm } from "@/components/checkout/contact-form";

afterEach(() => { cleanup(); sessionStorage.clear(); });

test("a validation error focuses the first problem without erasing contact details", async () => {
  const initial = { businessName: "Local Shop", contactName: "Alex", email: "alex@", phone: "9145550123", website: "", category: "" };
  const action = vi.fn(async () => ({ values: initial, errors: { email: "Enter a valid email address." } }));
  render(<ContactForm action={action} initial={initial} hideCategory />);
  fireEvent.click(screen.getByRole("button", { name: "Continue to save card" }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Email/)));
  expect(screen.getByLabelText(/Business name/)).toHaveProperty("value", "Local Shop");
  expect(screen.getByLabelText(/Your name/)).toHaveProperty("value", "Alex");
  expect(screen.getByLabelText(/Phone/)).toHaveProperty("value", "9145550123");
  expect(screen.queryByLabelText(/Type of business/)).toBeNull();
});
