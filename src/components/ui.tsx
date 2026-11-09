/**
 * Shared building blocks for every screen and every tool (CLAUDE.md: "every
 * tool uses the shared shell"). Styling lives here so screens stay consistent.
 */

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const base =
  "inline-flex min-h-[41px] items-center justify-center gap-1.5 rounded-control border px-3.5 py-2 text-base transition-colors disabled:opacity-50";

export const buttonStyles = {
  primary: `${base} border-accent-hover bg-accent text-white hover:bg-accent-hover`,
  secondary: `${base} border-border-strong bg-subtle text-text hover:bg-border`,
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
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-[1.75rem] font-normal text-balance">{title}</h1>
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
      <h2 className="text-xl font-bold text-balance">{title}</h2>
      <div className="max-w-[60ch] text-muted">{children}</div>
      {action && <div className="mt-2 flex flex-wrap gap-3">{action}</div>}
    </section>
  );
}

/** A file picker whose button looks like a button, not plain text (feedback 2ddd8e96). */
export const fileInputStyles =
  "text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-control file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text hover:file:bg-accent-soft";

export const inputStyles =
  "w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text placeholder:text-muted";
