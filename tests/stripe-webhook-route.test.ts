import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// MOCKED handler/clients, REAL Stripe signature verification (no network).
vi.mock("server-only", () => ({}));
const handleStripeEvent = vi.fn(async () => "handled");
vi.mock("@/lib/checkout/webhook", () => ({ handleStripeEvent }));
vi.mock("@/lib/checkout/stripe", () => ({ getStripe: () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const paymentHandler = vi.fn(async () => "recorded");
vi.mock("@/lib/payments/charge", () => ({ getCollectionStripe: () => ({context:{mode:"test",accountId:"acct_fixture"}}), handlePaymentEvent: paymentHandler }));

const SECRET = "whsec_test_secret_for_unit_tests";
const { POST } = await import("@/app/api/stripe/webhook/route");

const payload = JSON.stringify({
  id: "evt_test_1",
  object: "event",
  type: "setup_intent.succeeded",
  data: { object: { id: "seti_123", object: "setup_intent", metadata: { booking_id: "b1" } } },
});

const request = (body: string, signature?: string) =>
  new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    body,
    headers: signature ? { "stripe-signature": signature } : {},
  });

beforeEach(() => vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET));
afterEach(() => {
  vi.unstubAllEnvs();
  handleStripeEvent.mockClear();
  paymentHandler.mockClear();
});

describe("Stripe webhook route", () => {
  test("accepts a correctly signed event and passes it to the handler", async () => {
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    const response = await POST(request(payload, signature));
    expect(response.status).toBe(200);
    expect(handleStripeEvent).toHaveBeenCalledTimes(1);
    expect((handleStripeEvent.mock.calls[0] as unknown[])[2]).toMatchObject({ id: "evt_test_1", type: "setup_intent.succeeded" });
  });

  test("rejects a missing signature", async () => {
    expect((await POST(request(payload))).status).toBe(400);
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  test("rejects a signature made with another secret", async () => {
    const forged = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_attacker" });
    expect((await POST(request(payload, forged))).status).toBe(400);
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  test("rejects a tampered body", async () => {
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    const tampered = payload.replace("b1", "someone-elses-booking");
    expect((await POST(request(tampered, signature))).status).toBe(400);
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  test("asks Stripe to retry (500) when handling fails", async () => {
    handleStripeEvent.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    expect((await POST(request(payload, signature))).status).toBe(500);
  });
});


test("signed test payment events use the separate collection handler",async()=>{
 const body=JSON.stringify({id:"evt_pay",type:"payment_intent.succeeded",livemode:false,data:{object:{id:"pi_test"}}});
 const signature=Stripe.webhooks.generateTestHeaderString({payload:body,secret:SECRET});
 expect((await POST(request(body,signature))).status).toBe(200);expect(paymentHandler).toHaveBeenCalledTimes(1);expect(handleStripeEvent).not.toHaveBeenCalled();
});
test("signed live payment events never enter test collection",async()=>{
 const body=JSON.stringify({id:"evt_live",type:"payment_intent.succeeded",livemode:true,data:{object:{id:"pi_live"}}});
 const signature=Stripe.webhooks.generateTestHeaderString({payload:body,secret:SECRET});
 expect((await POST(request(body,signature))).status).toBe(200);expect(paymentHandler).not.toHaveBeenCalled();
});
