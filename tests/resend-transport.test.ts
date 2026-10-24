import { afterEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { sendWithResend } = await import("@/lib/email/outbox");
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const message = { to: "approved-test@example.com", subject: "Reservation", text: "Text", html: "<p>Text</p>", idempotencyKey: "outbox-test-event" };
function configure() {
  vi.stubEnv("RESEND_API_KEY", "re_unit_placeholder");
  vi.stubEnv("EMAIL_FROM", "Inside914 <no-reply@inside914.com>");
}
test("uses the configured verified-domain sender and supplied idempotency key", async () => {
  configure();
  const fetcher = vi.fn(async () => Response.json({ id: "email_unit" }));
  vi.stubGlobal("fetch", fetcher);
  expect(await sendWithResend(message)).toEqual({ id: "email_unit" });
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.resend.com/emails");
  expect(init.headers).toMatchObject({ "Idempotency-Key": message.idempotencyKey });
  expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(JSON.parse(init.body as string)).toMatchObject({ from: "Inside914 <no-reply@inside914.com>", to: [message.to] });
});
test("does not call the provider when no delivery key is configured", async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(sendWithResend(message)).rejects.toThrow("email_not_configured");
  expect(fetcher).not.toHaveBeenCalled();
});
test("does not accept an HTTP success without a provider message identifier", async () => {
  configure(); vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));
  await expect(sendWithResend(message)).rejects.toThrow("provider_outcome_unknown");
});
test("reports provider failure as a code without exposing its response body", async () => {
  configure(); vi.stubGlobal("fetch", vi.fn(async () => new Response("sensitive provider detail", { status: 503 })));
  await expect(sendWithResend(message)).rejects.toThrow(/^provider_http_503$/);
});
