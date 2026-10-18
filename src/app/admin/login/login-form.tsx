"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/primitives";

export function LoginForm({ notice }: { notice?: string }) {
  // Permalink: if the form is submitted before JavaScript loads, the server still renders the result here.
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {}, "/admin/login");
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {(state.error || notice) && (
        <Notice tone="danger" role="alert">
          {state.error ?? notice}
        </Notice>
      )}
      <TextField id="email" label="Email" type="email" autoComplete="username" required defaultValue={state.email} />
      <TextField id="password" label="Password" type="password" autoComplete="current-password" required />
      <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
