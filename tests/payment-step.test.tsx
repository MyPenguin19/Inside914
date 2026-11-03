import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PaymentStep } from "@/components/checkout/payment-step";

// MOCKED: Stripe.js (no real card form in jsdom) and the server actions. Real Stripe test-mode
// behavior is covered by tests/integration/stripe.test.ts.
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  push.mockReset();
});

type ConfirmResult = { error?: { message: string }; setupIntent?: { status: string } };

function fakeStripe(confirm: () => Promise<ConfirmResult>) {
  let onChange: (e: { complete: boolean }) => void = () => {};
  const stripe = {
    elements: vi.fn(() => ({
      create: vi.fn(() => ({
        on: (_: string, cb: typeof onChange) => (onChange = cb),
        // Like Stripe.js: mounting replaces whatever is inside the container.
        mount: vi.fn((el: HTMLElement) => el.replaceChildren(document.createElement("iframe"))),
      })),
    })),
    confirmSetup: vi.fn(confirm),
  };
  return { stripe, completeCard: () => act(() => onChange({ complete: true })) };
}

function setup(opts: {
  confirm?: () => Promise<ConfirmResult>;
  outcome?: string;
  begin?: { ok: true; clientSecret: string; status: string } | { ok: false; reason: string };
  publishableKey?: string | null;
  multiple?: boolean;
} = {}) {
  const { stripe, completeCard } = fakeStripe(opts.confirm ?? (async () => ({ setupIntent: { status: "succeeded" } })));
  const actions = {
    beginPayment: vi.fn(async () => opts.begin ?? { ok: true as const, clientSecret: "seti_secret_x", status: "requires_payment_method" }),
    giveConsent: vi.fn(async () => ({ ok: true })),
    confirmReservation: vi.fn(async () => ({ outcome: opts.outcome ?? "confirmed" })),
  };
  render(
    <PaymentStep
      multiple={opts.multiple}
      publishableKey={opts.publishableKey === undefined ? "pk_test_x" : opts.publishableKey}
      consentText="Proposed authorization for a maximum of $399."
      termsVersion="v1"
      actions={actions}
      loadStripeJs={(async () => stripe) as never}
    />,
  );
  const submit = () => screen.getByRole("button", { name: /save card and reserve/i });
  const consent = () => screen.getByRole("checkbox");
  return { actions, stripe, completeCard, submit, consent };
}

async function readyAndFilled(s: ReturnType<typeof setup>) {
  await waitFor(() => expect(s.stripe.elements).toHaveBeenCalled());
  s.completeCard();
  fireEvent.click(s.consent());
}

describe("PaymentStep", () => {
  test("mounting Stripe's card form doesn't crash the page (React owns nothing inside the mount box)", async () => {
    const s = setup();
    await waitFor(() => expect(s.stripe.elements).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Loading secure card form…")).toBeNull());
    expect(screen.getByRole("checkbox")).toBeTruthy();
  });

  test("the consent box starts unticked and the button stays disabled until it's ticked", async () => {
    const s = setup();
    await waitFor(() => expect(s.stripe.elements).toHaveBeenCalled());
    s.completeCard();
    expect((s.consent() as HTMLInputElement).checked).toBe(false);
    expect(s.submit().hasAttribute("disabled")).toBe(true);
    fireEvent.click(s.consent());
    expect(s.submit().hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("link", { name: "Advertising terms" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Reservation and cancellation policy" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy policy" })).toBeTruthy();
  });

  test("success: records consent, saves the card, confirms on the server, shows confirmation", async () => {
    const s = setup();
    await readyAndFilled(s);
    fireEvent.click(s.submit());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/book/confirmed"));
    expect(s.actions.giveConsent).toHaveBeenCalledWith({ accepted: true, termsVersion: "v1", displayedConsent: "Proposed authorization for a maximum of $399." });
    expect(s.stripe.confirmSetup).toHaveBeenCalledWith(expect.objectContaining({ redirect: "if_required" }));
    expect(s.actions.confirmReservation).toHaveBeenCalledTimes(1);
  });

  test("a declined card shows Stripe's message and nothing is confirmed", async () => {
    const s = setup({ confirm: async () => ({ error: { message: "Your card was declined." } }) });
    await readyAndFilled(s);
    fireEvent.click(s.submit());
    expect((await screen.findByRole("alert")).textContent).toContain("Your card was declined.");
    expect(s.actions.confirmReservation).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  test("bank verification (3D Secure) that completes in Stripe's popup then confirms", async () => {
    // Stripe.js handles the verification step inside confirmSetup and resolves once it's done.
    const s = setup({ confirm: () => new Promise((resolve) => setTimeout(() => resolve({ setupIntent: { status: "succeeded" } }), 20)) });
    await readyAndFilled(s);
    fireEvent.click(s.submit());
    expect(screen.getByRole("button", { name: /saving your card/i })).toBeTruthy();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/book/confirmed"));
  });

  test("still-processing setups wait for the webhook instead of pretending", async () => {
    const s = setup({ confirm: async () => ({ setupIntent: { status: "processing" } }) });
    await readyAndFilled(s);
    fireEvent.click(s.submit());
    expect((await screen.findByRole("status")).textContent).toMatch(/still confirming/);
    expect(s.actions.confirmReservation).not.toHaveBeenCalled();
  });

  test("hold expired by the time the card is saved: explains and offers to start over", async () => {
    const s = setup({ outcome: "hold_expired" });
    await readyAndFilled(s);
    fireEvent.click(s.submit());
    expect((await screen.findByRole("alert")).textContent).toMatch(/hold ran out/);
    expect(screen.getByRole("link", { name: "Choose a position" })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  test("double-clicking submits only once", async () => {
    const s = setup({ confirm: () => new Promise((resolve) => setTimeout(() => resolve({ setupIntent: { status: "succeeded" } }), 30)) });
    await readyAndFilled(s);
    const button = s.submit();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(s.actions.giveConsent).toHaveBeenCalledTimes(1);
    expect(s.stripe.confirmSetup).toHaveBeenCalledTimes(1);
  });

  test("without Stripe configured, it says so and offers no card form", () => {
    setup({ publishableKey: null });
    expect(screen.getByRole("alert").textContent).toMatch(/aren't set up/);
    expect(screen.queryByRole("button", { name: /save card/i })).toBeNull();
  });

  test("an expired hold before the form loads blocks payment", async () => {
    setup({ begin: { ok: false, reason: "hold_expired" } });
    expect((await screen.findByRole("alert")).textContent).toMatch(/hold ran out/);
  });
});

describe("PaymentStep in development TEST mode", () => {
  test("shows a simulated card under a TEST banner, never loads Stripe, and confirms via simulation", async () => {
    const loadStripeJs = vi.fn();
    const actions = {
      beginPayment: vi.fn(async () => ({ ok: true as const, clientSecret: "seti_devtest_x_secret_test", status: "requires_payment_method" })),
      giveConsent: vi.fn(async () => ({ ok: true })),
      simulateCardSetup: vi.fn(async () => ({ ok: true })),
      confirmReservation: vi.fn(async () => ({ outcome: "confirmed" })),
    };
    render(
      <PaymentStep publishableKey={null} consentText="consent" termsVersion="v1" testMode actions={actions} loadStripeJs={loadStripeJs as never} />,
    );
    expect(screen.getByRole("note").textContent).toMatch(/TEST MODE.*no card is saved and no payment is authorized/);
    const button = await screen.findByRole("button", { name: /simulate card and create TEST reservation/i });
    expect(button.hasAttribute("disabled")).toBe(true); // consent still required
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(button);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/book/confirmed"));
    expect(actions.giveConsent).toHaveBeenCalledTimes(1);
    expect(actions.simulateCardSetup).toHaveBeenCalledTimes(1);
    expect(loadStripeJs).not.toHaveBeenCalled();
  });

  test("if the server refuses test mode, it says so and confirms nothing", async () => {
    const actions = {
      beginPayment: vi.fn(async () => ({ ok: true as const, clientSecret: "x", status: "requires_payment_method" })),
      giveConsent: vi.fn(async () => ({ ok: true })),
      simulateCardSetup: vi.fn(async () => ({ ok: false, reason: "test_mode_unavailable" })),
      confirmReservation: vi.fn(async () => ({ outcome: "confirmed" })),
    };
    render(<PaymentStep publishableKey={null} consentText="consent" termsVersion="v1" testMode actions={actions} />);
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(await screen.findByRole("button", { name: /simulate card/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Test mode isn't available/);
    expect(actions.confirmReservation).not.toHaveBeenCalled();
  });
});

test.each([
  [false, "Save card and reserve my space — $0 today"],
  [true, "Save card and reserve my advertising spaces — $0 today"],
] as const)("uses the approved review button wording for multiple=%s", async (multiple, label) => {
  setup({multiple,begin:{ok:true,clientSecret:"mock",status:"succeeded"}});
  await screen.findByText("Your card is already saved. Just confirm below.");
  expect(screen.getByRole("button",{name:label})).toBeTruthy();
  expect(screen.getByText("Due today: $0.00. No payment is collected today.")).toBeTruthy();
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
});


test("a connection failure after saving a card can retry confirmation without saving it twice", async () => {
 const s = setup();
 await readyAndFilled(s);
 s.actions.confirmReservation.mockRejectedValueOnce(new TypeError("Failed to fetch"));
 fireEvent.click(s.submit());
 expect((await screen.findByRole("alert")).textContent).toContain("Connection interrupted");
 expect(s.submit().hasAttribute("disabled")).toBe(false);
 expect((s.consent() as HTMLInputElement).checked).toBe(true);
 fireEvent.click(s.submit());
 await waitFor(() => expect(push).toHaveBeenCalledWith("/book/confirmed"));
 expect(s.stripe.confirmSetup).toHaveBeenCalledTimes(1);
 expect(s.actions.confirmReservation).toHaveBeenCalledTimes(2);
});

test("a connection failure recording consent preserves the form and permits retry", async () => {
 const s = setup();
 await readyAndFilled(s);
 s.actions.giveConsent.mockRejectedValueOnce(new TypeError("Failed to fetch"));
 fireEvent.click(s.submit());
 expect((await screen.findByRole("alert")).textContent).toContain("Connection interrupted");
 expect(s.stripe.confirmSetup).not.toHaveBeenCalled();
 expect(s.submit().hasAttribute("disabled")).toBe(false);
 fireEvent.click(s.submit());
 await waitFor(() => expect(push).toHaveBeenCalledWith("/book/confirmed"));
 expect(s.stripe.confirmSetup).toHaveBeenCalledTimes(1);
 expect(screen.queryByText(/Pending owner and legal review/)).toBeNull();
});
