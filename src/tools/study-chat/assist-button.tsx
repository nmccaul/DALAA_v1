"use client";

import { Sparkle } from "@phosphor-icons/react";
import { useState } from "react";
import { inputStyles } from "@/components/ui";

/**
 * A box's DALAA button (feedback 04c68408): "Draft" writes an empty box in
 * one click; once it has text, "Tweak" opens a small box for what to change,
 * and Rewrite asks for it. The button stays after every answer, so the
 * teacher can keep tweaking.
 */
export function AssistButton({
  name,
  empty,
  busy,
  disabled,
  error,
  onRun,
}: {
  /** What it writes, for screen readers: "Opening message". */
  name: string;
  empty: boolean;
  /** This box is being written now. */
  busy: boolean;
  /** Another box is being written: one at a time. */
  disabled: boolean;
  error: string | null;
  onRun: (instruction: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const run = () => {
    setOpen(false);
    onRun(instruction);
    setInstruction("");
  };

  return (
    <span className="relative inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy || disabled}
        aria-expanded={empty ? undefined : open}
        aria-label={`${busy ? "Writing" : empty ? "Draft" : "Tweak"} ${name} with DALAA`}
        onClick={() => (empty ? onRun("") : setOpen((o) => !o))}
        className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface px-2.5 py-0.5 text-[13px] font-medium text-accent-text hover:bg-accent-soft disabled:opacity-50"
      >
        <Sparkle size={14} weight="fill" aria-hidden />
        {busy ? "Writing…" : empty ? "Draft" : "Tweak"}
      </button>
      {error && (
        <span role="alert" className="text-[13px] text-danger">
          {error}
        </span>
      )}
      {open && (
        <span className="absolute top-full right-0 z-20 mt-1 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-control border border-border bg-surface p-3 shadow-sm">
          <label className="flex flex-col gap-1 text-[13px] font-medium">
            What should change?
            <input
              autoFocus
              value={instruction}
              maxLength={500}
              placeholder="e.g. shorter, friendlier, use alien jargon"
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  run();
                }
                if (e.key === "Escape") setOpen(false);
              }}
              className={`${inputStyles} text-sm`}
              autoComplete="off"
            />
          </label>
          <span className="flex items-center gap-3">
            <button type="button" onClick={run} className="rounded-control bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent-hover">
              Rewrite
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-text">
              Cancel
            </button>
          </span>
        </span>
      )}
    </span>
  );
}
