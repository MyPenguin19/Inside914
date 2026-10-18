import type { ReactNode } from "react";

// Small shared building blocks: cards, section headings, status badges, notes.

export function Card({
  children,
  className = "",
  as: Tag = "div",
  tone = "light",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "aside";
  tone?: "light" | "dark";
}) {
  const colors = tone === "dark" ? "border-foreground bg-foreground text-background" : "border-line bg-surface";
  return <Tag className={`rounded-2xl border p-5 sm:p-6 ${colors} ${className}`}>{children}</Tag>;
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs font-semibold uppercase tracking-[0.18em] text-accent ${className}`}>{children}</p>;
}

export function SectionHeading({
  eyebrow,
  title,
  intro,
  id,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  id?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 id={id} className="mt-2 font-display text-3xl font-medium tracking-tight sm:text-4xl">
        {title}
      </h2>
      {intro && <p className="mt-3 text-lg leading-relaxed text-muted">{intro}</p>}
    </div>
  );
}

export type Tone = "neutral" | "success" | "info" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-background-soft text-muted",
  success: "bg-accent-soft text-accent",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function StatusBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${TONES[tone]}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function Notice({ tone = "neutral", children, role }: { tone?: Tone; children: ReactNode; role?: "note" | "status" | "alert" }) {
  return <div role={role} className={`rounded-xl px-4 py-3 text-sm ${TONES[tone]}`}>{children}</div>;
}
