import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
const submit = vi.hoisted(() => vi.fn());
vi.mock("@/app/contact/actions", () => ({ submitContactMessage: submit }));
import { ContactMessageForm } from "@/components/contact-message-form";
import { CONTACT_RECEIVED } from "@/lib/contact/schema";
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const fill = () => {
  fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: "Jane" } });
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "jane@example.com" } });
  fireEvent.change(screen.getByLabelText(/^Message/), { target: { value: "My advertising question." } });
};
test("shows success after receipt and prevents resubmission while pending", async () => {
  let resolve!: (value: { ok: boolean; message: string }) => void;
  submit.mockImplementation(() => new Promise(done => { resolve = done; }));
  render(<ContactMessageForm />); fill();
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Sending…" }).hasAttribute("disabled")).toBe(true));
  expect(submit).toHaveBeenCalledTimes(1);
  resolve({ ok: true, message: CONTACT_RECEIVED });
  expect((await screen.findByRole("status")).textContent).toBe(CONTACT_RECEIVED);
});
test("a failed request retains the message and retries with the same submission identity", async () => {
  submit.mockRejectedValueOnce(new Error("network"));
  submit.mockResolvedValueOnce({ ok: true, message: CONTACT_RECEIVED });
  render(<ContactMessageForm />); fill();
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByRole("alert");
  expect((screen.getByLabelText(/^Message/) as HTMLTextAreaElement).value).toBe("My advertising question.");
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByRole("status");
  expect(submit.mock.calls[0][1].get("submissionId")).toBe(submit.mock.calls[1][1].get("submissionId"));
});
