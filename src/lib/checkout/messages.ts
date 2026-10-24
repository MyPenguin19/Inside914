// Plain-language explanations for checkout outcomes, shared by pages and client components.

export const CHECKOUT_CLOSED_MESSAGE = "Reservations are not open yet. You can explore the advertising areas or contact Info@inside914.com.";

export const CHECKOUT_MESSAGES: Record<string, string> = {
  checkout_closed: CHECKOUT_CLOSED_MESSAGE,
  no_hold: "We couldn't find a position on hold for you. Please choose your position again.",
  hold_expired:
    "Your 15-minute hold ran out before checkout finished, so the position was released and your card was not kept. Nothing was charged. Please choose a position again.",
  inventory_lost:
    "That position is no longer available, so we couldn't reserve it. Nothing was charged and your card was not kept. Please choose another position.",
  not_pending: "This booking can't be confirmed anymore. Nothing was charged. Please choose a position again.",
  edition_closed: "This edition has closed for booking. Nothing was charged.",
  artwork_missing: "Please add and position your artwork before checking out.",
  contact_missing: "Please enter your business details first.",
  consent_missing: "Please tick the authorization box to continue.",
  consent_required: "Please tick the authorization box to continue.",
  terms_changed: "Our terms were just updated. Please refresh the page and review them before continuing.",
  payment_not_started: "Your secure card form didn't finish loading. Please refresh the page.",
  setup_not_succeeded: "Your card hasn't been confirmed yet. Please try again.",
  setup_mismatch: "Something didn't match up with your card details. Please refresh the page and try again.",
  wrong_setup_intent: "Your card form is out of date. Please refresh the page and try again.",
  test_booking: "This is a TEST reservation from development mode and can't be completed with a real card.",
  real_booking: "This booking was started with a real card form and can't be finished in test mode.",
  test_mode_unavailable: "Test mode isn't available here.",
  payments_unavailable: "Card payments aren't set up on this site yet, so bookings can't be completed right now.",
  error: "Something went wrong on our side. Nothing was charged; please try again in a moment.",
};

export const checkoutMessage = (reason: string) => CHECKOUT_MESSAGES[reason] ?? CHECKOUT_MESSAGES.error;

// Outcomes after which the customer has to start again from the postcard.
export const START_OVER = new Set(["no_hold", "hold_expired", "inventory_lost", "not_pending", "edition_closed"]);
