import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ConfirmAction } from "@/components/admin/confirm-action";
import type { ActionResult } from "@/app/admin/admin-actions";

afterEach(cleanup);
test("confirmation remains locked until the save finishes, then shows the result", async () => {
  let finish!: (result: ActionResult) => void;
  const action = vi.fn(() => new Promise<ActionResult>(resolve => { finish = resolve; }));
  render(<ConfirmAction label="Pause reservations" confirmLabel="Pause" consequence="Customers cannot start new holds." action={action} fields={{id:"fixture"}} />);
  fireEvent.click(screen.getByRole("button", {name:"Pause reservations"}));
  fireEvent.click(screen.getByRole("button", {name:"Pause"}));
  await waitFor(() => expect(screen.getByRole("button", {name:"Working…"})).toHaveProperty("disabled", true));
  expect(screen.getByRole("button", {name:"Keep as is"})).toHaveProperty("disabled", true);
  expect(screen.queryByRole("button", {name:"Pause reservations"})).toBeNull();
  expect(action).toHaveBeenCalledTimes(1);
  finish({ok:true,message:"Reservations paused."});
  expect((await screen.findByRole("status")).textContent).toBe("Reservations paused.");
});

test("a refused save keeps the explanation and typed confirmation for correction and retry", async () => {
  const action = vi.fn().mockResolvedValueOnce({message:"This reservation needs payment review first."}).mockResolvedValueOnce({ok:true,message:"Saved."});
  render(<ConfirmAction label="Cancel reservation" confirmLabel="Confirm cancellation" consequence="Release its space." action={action} fields={{id:"fixture"}} reasonLabel="Reason" confirmationPhrase="CANCEL" />);
  fireEvent.click(screen.getByRole("button", {name:"Cancel reservation"}));
  fireEvent.change(screen.getByLabelText("Reason"), {target:{value:"Requested by advertiser"}});
  fireEvent.change(screen.getByLabelText("Type CANCEL to confirm"), {target:{value:"CANCEL"}});
  fireEvent.click(screen.getByRole("button", {name:"Confirm cancellation"}));
  expect((await screen.findByRole("alert")).textContent).toContain("payment review");
  expect(screen.getByLabelText("Reason")).toHaveProperty("value", "Requested by advertiser");
  expect(screen.getByLabelText("Type CANCEL to confirm")).toHaveProperty("value", "CANCEL");
  fireEvent.click(screen.getByRole("button", {name:"Confirm cancellation"}));
  expect((await screen.findByRole("status")).textContent).toBe("Saved.");
  expect(action.mock.calls[1][1].get("reason")).toBe("Requested by advertiser");
});
