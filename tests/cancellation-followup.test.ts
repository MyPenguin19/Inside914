import { beforeEach, describe, expect, test, vi } from "vitest";

// MOCKED card removal and email outbox: checks the ORDER of the follow-ups and their failure handling.
vi.mock("server-only", () => ({}));
const calls: string[] = [];
const removeSavedCard = vi.fn(async (_a: unknown, _s: unknown, id: string) => (calls.push(`card:${id}`), "removed"));
const processOutboxForBooking = vi.fn(async (_a: unknown, id: string) => (calls.push(`email:${id}`), ["sent"]));
vi.mock("@/lib/checkout/card-removal", () => ({ removeSavedCard }));
vi.mock("@/lib/email/outbox", () => ({ processOutboxForBooking }));
const { followUpCancellations } = await import("@/lib/checkout/cancellation-followup");

beforeEach(() => {
  calls.length = 0;
  removeSavedCard.mockClear();
  processOutboxForBooking.mockClear();
});

describe("after a cancellation", () => {
  test("removes every saved card BEFORE any email, so the email can say truthfully whether it's gone", async () => {
    const result = await followUpCancellations({} as never, () => ({}) as never, ["b1", "b2"]);
    expect(calls).toEqual(["card:b1", "card:b2", "email:b1", "email:b2"]);
    expect(result).toEqual({ cards: ["removed", "removed"], emails: ["sent", "sent"] });
  });

  test("a Stripe failure doesn't stop the email (it then says removal is in progress); both are retried later", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    removeSavedCard.mockImplementationOnce(async () => {
      throw new Error("stripe down");
    });
    const result = await followUpCancellations({} as never, () => ({}) as never, ["b1"]);
    expect(result).toEqual({ cards: ["failed"], emails: ["sent"] });
  });

  test("Stripe not configured: cards are left for the retry job, emails still go out", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await followUpCancellations({} as never, () => {
      throw new Error("STRIPE_SECRET_KEY is required");
    }, ["b1"]);
    expect(removeSavedCard).not.toHaveBeenCalled();
    expect(result).toEqual({ cards: ["failed"], emails: ["sent"] });
  });

  test("an email failure is reported, not thrown", async () => {
    processOutboxForBooking.mockImplementationOnce(async () => {
      throw new Error("db");
    });
    expect(await followUpCancellations({} as never, () => ({}) as never, ["b1"])).toEqual({ cards: ["removed"], emails: ["failed"] });
  });
});
