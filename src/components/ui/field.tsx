import type { ComponentProps, ReactNode } from "react";

// Form controls: one label/hint/error pattern and one input style for every form on the site.

export function controlClass(invalid = false) {
  return `w-full min-w-0 rounded-xl border bg-surface px-3.5 py-3 text-base transition-colors placeholder:text-muted hover:border-muted focus-visible:border-accent ${
    invalid ? "border-danger" : "border-control-line"
  }`;
}

type Shell = { id: string; label: string; required?: boolean; optional?: boolean; hint?: ReactNode; error?: string };

function describedBy({ id, hint, error }: Shell) {
  return [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
}

function FieldShell({ id, label, required, optional, hint, error, children }: Shell & { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span aria-hidden="true" className="text-muted"> *</span>}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm text-danger">
          <span aria-hidden="true">!</span>
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({ id, label, required, optional, hint, error, ...input }: Shell & Omit<ComponentProps<"input">, "id">) {
  const shell = { id, label, required, optional, hint, error };
  return (
    <FieldShell {...shell}>
      <input
        id={id}
        name={id}
        required={required}
        aria-invalid={!!error}
        aria-describedby={describedBy(shell)}
        {...input}
        className={controlClass(!!error)}
      />
    </FieldShell>
  );
}

export function SelectField({
  id,
  label,
  required,
  optional,
  hint,
  error,
  children,
  ...select
}: Shell & Omit<ComponentProps<"select">, "id">) {
  const shell = { id, label, required, optional, hint, error };
  return (
    <FieldShell {...shell}>
      <select
        id={id}
        name={id}
        required={required}
        aria-invalid={!!error}
        aria-describedby={describedBy(shell)}
        {...select}
        className={controlClass(!!error)}
      >
        {children}
      </select>
    </FieldShell>
  );
}
