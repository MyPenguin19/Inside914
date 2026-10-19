"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/env/checkout";
import { getServerEnv } from "@/lib/env/server";
import {
  allowHoldAttempt,
  clientAddress,
  visitorHash,
} from "@/lib/booking/hold-rate-limit";
export type AccountState = { message?: string; email?: string };
const Email = z.email().max(320);
const Password = z.string().min(12).max(128);
async function allowed() {
  return allowHoldAttempt(
    createAdminClient(),
    visitorHash(
      `account:${clientAddress(await headers())}`,
      getServerEnv().SUPABASE_SECRET_KEY,
    ),
  );
}
export async function signUp(
  _state: AccountState,
  form: FormData,
): Promise<AccountState> {
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = form.get("password");
  if (!Email.safeParse(email).success || !Password.safeParse(password).success)
    return {
      email,
      message: "Enter a valid email and a password of 12–128 characters.",
    };
  if (!(await allowed()))
    return { email, message: "Please wait a few minutes before trying again." };
  const client = await createClient();
  const { data } = await client.auth.signUp({
    email,
    password: String(password),
    options: { emailRedirectTo: `${getAppUrl()}/account/callback` },
  });
  if (data.session && data.user?.email_confirmed_at)
    redirect("/account/verify");
  return {
    email,
    message:
      "If signup is available for this address, check your email to confirm your account. If you already have an account, sign in or reset your password.",
  };
}
export async function signIn(
  _state: AccountState,
  form: FormData,
): Promise<AccountState> {
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = form.get("password");
  if (
    !Email.safeParse(email).success ||
    !z.string().min(1).max(128).safeParse(password).success
  )
    return { email, message: "Enter your email and password." };
  if (!(await allowed()))
    return { email, message: "Please wait a few minutes before trying again." };
  const client = await createClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: String(password),
  });
  if (error || !data.user?.email_confirmed_at)
    return {
      email,
      message:
        "Unable to sign in. Check your details and confirm your email first.",
    };
  redirect("/dashboard");
}
export async function signOut() {
  const client = await createClient();
  await client.auth.signOut();
  redirect("/account/login");
}
export async function forgotPassword(
  _state: AccountState,
  form: FormData,
): Promise<AccountState> {
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!Email.safeParse(email).success)
    return { email, message: "Enter a valid email." };
  if (await allowed()) {
    const client = await createClient();
    await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${getAppUrl()}/account/callback?next=reset`,
    });
  }
  return {
    email,
    message:
      "If an account exists, check your email for a password reset link.",
  };
}
export async function resetPassword(
  _state: AccountState,
  form: FormData,
): Promise<AccountState> {
  const password = Password.safeParse(form.get("password"));
  if (!password.success)
    return { message: "Use a password of 12–128 characters." };
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user?.email_confirmed_at)
    return { message: "Open the password reset link from your email first." };
  const { error } = await client.auth.updateUser({ password: password.data });
  if (error)
    return {
      message:
        "Could not update your password. Request a new reset link and try again.",
    };
  redirect("/dashboard");
}

export async function sendVerification(): Promise<AccountState> {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user?.email) redirect("/account/login");
  if (await allowed())
    await client.auth.signInWithOtp({
      email: user.email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${getAppUrl()}/account/callback`,
      },
    });
  return {
    message:
      "Check your email for a verification link. Open it in this browser to unlock your reservations.",
  };
}
