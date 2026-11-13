"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui";

export type StudentStep = {
  key: string;
  label: string;
  content: ReactNode;
  /** The button at the bottom that moves on; none on the last step. */
  next?: string;
  /** A small link at the top to another step, e.g. back to the reading from the chat. */
  link?: { label: string; to: string };
};

/**
 * A Study Chat for the student as a few short steps, one on screen at a time
 * (D-036, feedback from Nathan 2026-11-13: a page showing everything at once
 * left students unsure where to look, and Canvas's frame is narrow). The bar
 * at the top says where they are and goes back to any step; every step stays
 * mounted, so going back to the reading mid-chat loses nothing.
 */
export function StudentSteps({ steps, start }: { steps: StudentStep[]; start: string }) {
  const [current, setCurrent] = useState(() => (steps.some((s) => s.key === start) ? start : steps[0].key));
  const heading = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const at = Math.max(0, steps.findIndex((s) => s.key === current));

  // A new step starts at its top, with focus on it for keyboard and screen-reader users.
  useEffect(() => {
    if (!moved.current) return;
    heading.current?.scrollIntoView({ block: "start" });
    heading.current?.focus({ preventScroll: true });
  }, [current]);

  const go = (key: string) => {
    moved.current = true;
    setCurrent(key);
  };

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Steps" ref={heading} tabIndex={-1} className="scroll-mt-4 focus:outline-none">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
          {steps.map((s, i) => {
            const here = i === at;
            const done = i < at;
            return (
              <li key={s.key} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden className={`h-px w-4 sm:w-8 ${done || here ? "bg-accent" : "bg-border-strong"}`} />}
                <button
                  type="button"
                  onClick={() => go(s.key)}
                  aria-current={here ? "step" : undefined}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 whitespace-nowrap ${
                    here
                      ? "border-accent bg-accent font-bold text-white"
                      : done
                        ? "border-accent bg-accent-soft text-accent-text hover:bg-accent hover:text-white"
                        : "border-border-strong bg-surface text-accent-text hover:bg-subtle"
                  }`}
                >
                  <span aria-hidden className="tabular-nums">{done ? "✓" : i + 1}</span>
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      {steps.map((s, i) => (
        <section key={s.key} hidden={i !== at} aria-label={s.label} className="flex flex-col gap-5">
          {s.link && (
            <button type="button" onClick={() => go(s.link!.to)} className="self-start text-sm text-accent-text underline hover:text-accent">
              {s.link.label}
            </button>
          )}
          {s.content}
          {s.next && i + 1 < steps.length && (
            <div className="flex border-t border-border pt-5">
              <Button type="button" onClick={() => go(steps[i + 1].key)}>
                {s.next}
              </Button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

