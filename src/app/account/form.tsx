"use client";
import { useActionState } from "react";
import {
  signUp,
  signIn,
  forgotPassword,
  resetPassword,
  sendVerification,
} from "./actions";
import { TextField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/primitives";
export function AccountForm({
  mode,
}: {
  mode: "signup" | "login" | "forgot" | "reset" | "verify";
}) {
  const action = {
    signup: signUp,
    login: signIn,
    forgot: forgotPassword,
    reset: resetPassword,
    verify: sendVerification,
  }[mode];
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit} className="flex flex-col gap-4">
      {state.message && <Notice role="status">{state.message}</Notice>}
      {mode !== "reset" && mode !== "verify" && (
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
        />
      )}{" "}
      {mode !== "forgot" && mode !== "verify" && (
        <TextField
          id="password"
          label="Password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={mode === "login" ? 1 : 12}
          maxLength={128}
          required
          hint={mode === "login" ? undefined : "Use at least 12 characters."}
        />
      )}
      <Button type="submit" disabled={pending}>
        {pending
          ? "Please wait…"
          : {
              signup: "Create account",
              login: "Sign in",
              forgot: "Send reset link",
              reset: "Save password",
              verify: "Send verification link",
            }[mode]}
      </Button>
    </form>
  );
}
