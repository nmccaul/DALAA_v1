/**
 * The browser's recent console warnings/errors and thrown errors, kept so a
 * feedback report can say what went wrong just before it was sent. Installed
 * once when the feedback button's module loads; it only remembers, it never
 * changes what the console prints. Strings are scrubbed again on the server.
 */

import { RING_SIZE, type ReportContext } from "./report";

type Entries = Pick<ReportContext, "console" | "errors">;

/** What the ring needs from `window`, so tests can hand it a fake. */
export type RingTarget = {
  console: Pick<Console, "warn" | "error">;
  addEventListener(type: "error" | "unhandledrejection", listener: (event: Event) => void): void;
};

const MARK = Symbol.for("dalaa.feedback.ring");

function text(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function push<T>(list: T[], entry: T) {
  list.push(entry);
  if (list.length > RING_SIZE) list.splice(0, list.length - RING_SIZE);
}

/** Starts remembering; a second call on the same target returns the first ring. */
export function installRing(target: RingTarget, now: () => number = Date.now): () => Entries {
  const marked = target as RingTarget & { [MARK]?: () => Entries };
  if (marked[MARK]) return marked[MARK];

  const entries: Entries = { console: [], errors: [] };
  for (const level of ["warn", "error"] as const) {
    const original = target.console[level].bind(target.console);
    target.console[level] = (...args: unknown[]) => {
      push(entries.console, { t: now(), level, text: args.map(text).join(" ").slice(0, 300) });
      original(...args);
    };
  }
  target.addEventListener("error", (event) => {
    const e = event as ErrorEvent;
    const error = e.error instanceof Error ? e.error : null;
    push(entries.errors, { t: now(), message: (error ? text(error) : e.message || "Unknown error").slice(0, 300), stack: error?.stack?.slice(0, 2000) ?? null });
  });
  target.addEventListener("unhandledrejection", (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    push(entries.errors, {
      t: now(),
      message: `Unhandled rejection: ${text(reason)}`.slice(0, 300),
      stack: reason instanceof Error ? (reason.stack?.slice(0, 2000) ?? null) : null,
    });
  });

  const snapshot = () => ({ console: [...entries.console], errors: [...entries.errors] });
  marked[MARK] = snapshot;
  return snapshot;
}
