/**
 * Shared building blocks for every screen and every tool (CLAUDE.md: "every
 * tool uses the shared shell"). Styling lives here so screens stay consistent.
 */

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const base =
  "inline-flex items-center justify-center gap-2 rounded-control px-4 py-2 text-sm font-medium transition-colors active:translate-y-px disabled:opacity-50";

export const buttonStyles = {
  primary: `${base} bg-accent text-white hover:bg-accent-hover`,
  secondary: `${base} border border-border-strong bg-surface text-text hover:bg-accent-soft`,
} as const;

type Variant = keyof typeof buttonStyles;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${buttonStyles[variant]} ${className}`} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${buttonStyles[variant]} ${className}`} {...props} />;
}

/** One per screen: the title, an optional line under it, and the screen's primary action. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="max-w-[65ch] text-muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}

/** What a screen shows before there's anything in it: what goes here, and how to add it. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-panel border border-dashed border-border-strong/60 bg-surface px-6 py-10 sm:px-10">
      <h2 className="font-display text-xl font-semibold text-balance">{title}</h2>
      <div className="max-w-[60ch] text-muted">{children}</div>
      {action && <div className="mt-2 flex flex-wrap gap-3">{action}</div>}
    </section>
  );
}

export const inputStyles =
  "w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text placeholder:text-muted";
