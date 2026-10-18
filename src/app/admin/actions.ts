"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; email?: string };

const Credentials = z.object({ email: z.email().max(320), password: z.string().min(1).max(200) });

// Email + password via Supabase Auth. There is no sign-up here: admin accounts are created by the
// owner in Supabase and granted access with a row in public.admins.
export async function signIn(_state: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const parsed = Credentials.safeParse({ email, password: form.get("password") });
  if (!parsed.success) return { error: "Please enter your email and password.", email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  // One message for unknown email and wrong password, so accounts can't be probed.
  if (error || !data.user) return { error: "That email and password don't match an admin account.", email };

  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (!admin) {
    await supabase.auth.signOut();
    return { error: "That email and password don't match an admin account.", email };
  }
  redirect("/admin");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
