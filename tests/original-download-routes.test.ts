// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn(), locate: vi.fn(), sign: vi.fn(), campaign: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.client }));
vi.mock("@/lib/admin/originals", () => ({ locateOriginals: mocks.locate, signOriginal: mocks.sign, campaignOriginals: mocks.campaign, ORIGINAL_HEADERS: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } }));
import { GET as individual } from "@/app/admin/artwork/[id]/original/route";
import { GET as campaign } from "@/app/admin/campaigns/[id]/originals/route";
const id = "00000000-0000-4000-8000-000000000001", params = { params: Promise.resolve({ id }) };
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ supabase: "RLS-admin" }); mocks.client.mockReturnValue("private-storage"); });
test.each([individual, campaign])("download endpoint refuses a failed admin check before looking up data", async handler => {
  mocks.auth.mockRejectedValue(new Error("not_admin"));
  await expect(handler(new Request(`https://fixture.invalid/admin/${id}`), params)).rejects.toThrow("not_admin");
  expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.locate).not.toHaveBeenCalled(); expect(mocks.campaign).not.toHaveBeenCalled();
});
test("unknown booking or swapped version never reaches privileged storage signing", async () => {
  mocks.locate.mockResolvedValue([{ source: { version: "a".repeat(64), kind: "current" } }]);
  expect((await individual(new Request(`https://fixture.invalid/admin/${id}?version=${"b".repeat(64)}`), params)).status).toBe(404);
  expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.sign).not.toHaveBeenCalled();
});
test("path injection is rejected and signed-link JSON is private and non-referring", async () => {
  expect((await individual(new Request(`https://fixture.invalid/admin/${id}?path=../other`), params)).status).toBe(400);
  mocks.locate.mockResolvedValue([{ source: { version: "a".repeat(64), kind: "current" } }]);
  mocks.sign.mockResolvedValue({ source: {}, url: "https://fixture.invalid/short-lived" });
  const response = await individual(new Request(`https://fixture.invalid/admin/${id}`), params);
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store"); expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(mocks.locate).toHaveBeenCalledWith("RLS-admin", id, false);
});
