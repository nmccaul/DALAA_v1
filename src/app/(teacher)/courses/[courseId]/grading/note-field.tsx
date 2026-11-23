"use client";

import { Sparkle } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { inputStyles } from "@/components/ui";
import { polishNoteAction } from "./actions";

/**
 * Why the teacher changed a grade (feedback ae234e89): the student sees it
 * with their grade. "Polish with AI" rewrites what's in the box more clearly
 * for the teacher to keep or edit; nothing is saved until Save.
 */
export function NoteField({
  attemptId,
  initial,
  max,
  aiScore,
  maxScore,
}: {
  attemptId: string;
  initial: string | null;
  max: number;
  aiScore: number | null;
  maxScore: number | null;
}) {
  const [text, setText] = useState(initial ?? "");
  // The teacher's own words before the last polish, to put back if the AI got it wrong.
  const [before, setBefore] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polishing, startPolish] = useTransition();
  const id = `note-${attemptId}`;

  const polish = () =>
    startPolish(async () => {
      setError(null);
      // The score being set, read from this form's score box, so the AI knows whether the grade went up or down.
      const box = document.getElementById(id)?.closest("form")?.querySelector<HTMLInputElement>('input[name="score"]');
      const teacher = box && box.value.trim() !== "" ? Number(box.value) : null;
      const out = await polishNoteAction(attemptId, text, { ai: aiScore, teacher, max: maxScore });
      if (out.text) {
        setBefore(text);
        setText(out.text);
      } else setError(out.error ?? "The AI didn't answer.");
    });

  return (
    <div className="flex w-full flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        Why you changed it <span className="font-normal text-muted">(optional; the student sees this with their grade)</span>
      </label>
      <textarea
        id={id}
        name="note"
        rows={3}
        maxLength={max}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setBefore(null);
        }}
        placeholder="e.g. You explained the stripes well, but the AI missed that you also covered the colors."
        className={inputStyles}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={polish}
          disabled={polishing || text.trim() === ""}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-text hover:underline disabled:opacity-50 disabled:no-underline"
        >
          <Sparkle size={14} aria-hidden />
          {polishing ? "Polishing…" : "Polish with AI"}
        </button>
        {before !== null && (
          <button
            type="button"
            onClick={() => {
              setText(before);
              setBefore(null);
            }}
            className="text-sm font-medium text-muted hover:text-text hover:underline"
          >
            Undo: use my words
          </button>
        )}
        {before !== null && <span className="text-[13px] text-muted">Check it still says what you meant.</span>}
        {error && (
          <span role="alert" className="text-sm text-danger">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
