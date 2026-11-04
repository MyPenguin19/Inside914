import { expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
vi.mock("server-only", () => ({}));
import { verifyAdminSession } from "@/lib/admin/session";

function client(user: unknown, membership: unknown, userError: unknown = null, membershipError: unknown = null) {
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: userError });
  const maybeSingle = vi.fn().mockResolvedValue({ data: membership, error: membershipError });
  return {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "untrusted-cookie-credential", user: { id: "forged-user" } } }, error: null }), getUser },
    from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ maybeSingle }) }),
    maybeSingle,
  };
}

test("cookie identity cannot authorize an admin; both authoritative results must agree", async () => {
  for (const db of [
    client(null, { user_id: "forged-user" }),
    client({ id: "verified-user" }, { user_id: "forged-user" }),
    client({ id: "verified-user" }, { user_id: "verified-user" }, new Error("revoked")),
    client({ id: "verified-user" }, { user_id: "verified-user" }, null, new Error("unavailable")),
    client({ id: "verified-user" }, null),
  ]) expect((await verifyAdminSession(db as unknown as SupabaseClient<Database>)).isAdmin).toBe(false);
});

test("membership starts while remote verification is pending, and access waits for verification", async () => {
  const db = client({ id: "verified-user" }, { user_id: "verified-user" });
  let finish!: (value: unknown) => void;
  db.auth.getUser.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  let finished = false;
  const result = verifyAdminSession(db as unknown as SupabaseClient<Database>).then(value => { finished = true; return value; });
  await vi.waitFor(() => expect(db.maybeSingle).toHaveBeenCalled());
  expect(finished).toBe(false);
  expect(db.auth.getUser).toHaveBeenCalledWith("untrusted-cookie-credential");
  finish({ data: { user: { id: "verified-user" } }, error: null });
  expect(await result).toMatchObject({ isAdmin: true, user: { id: "verified-user" } });
});
