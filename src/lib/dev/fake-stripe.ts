import "server-only";
import { randomBytes } from "node:crypto";
import { DEV_TEST_PREFIX } from "./test-mode";

// A stand-in for the four Stripe calls checkout makes, for development TEST reservations.
// It cannot charge anything: there are no payment, charge, subscription or invoice methods.
// State lives in this dev server's memory (kept on globalThis so hot reloads don't wipe it).

type FakeIntent = {
  id: string;
  status: string;
  client_secret: string;
  customer: string;
  payment_method: string | null;
  metadata: Record<string, string>;
};

const store: Map<string, FakeIntent> = ((globalThis as { __inside914FakeStripe?: Map<string, FakeIntent> }).__inside914FakeStripe ??=
  new Map());

const fakeId = (kind: "cus" | "seti" | "pm") => `${kind}_${DEV_TEST_PREFIX}_${randomBytes(9).toString("hex")}`;

export const fakeStripe = {
  isDevTestFake: true as const,
  customers: {
    create: async () => ({ id: fakeId("cus") }),
    update: async () => ({}),
  },
  setupIntents: {
    create: async (params: { customer: string; metadata?: Record<string, string> }) => {
      const id = fakeId("seti");
      const intent: FakeIntent = {
        id,
        status: "requires_payment_method",
        client_secret: `${id}_secret_test`,
        customer: params.customer,
        payment_method: null,
        metadata: params.metadata ?? {},
      };
      store.set(id, intent);
      return intent;
    },
    // Unknown ids (e.g. after a dev server restart) look canceled, so checkout starts a new one.
    retrieve: async (id: string) =>
      store.get(id) ?? { id, status: "canceled", client_secret: "", customer: "", payment_method: null, metadata: {} },
  },
  paymentMethods: {
    detach: async () => ({}),
  },
  // What a successful card form submission would do, minus any card.
  simulateSuccess(setupIntentId: string) {
    const intent = store.get(setupIntentId);
    if (!intent) return false;
    intent.status = "succeeded";
    intent.payment_method ??= fakeId("pm");
    return true;
  },
};

export function isFakeStripe(client: unknown): boolean {
  return typeof client === "object" && client !== null && (client as { isDevTestFake?: boolean }).isDevTestFake === true;
}
