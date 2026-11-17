"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, inputStyles } from "@/components/ui";
import { readAskEvents } from "@/results/ask-stream";

const STARTERS = ["What should I reteach?", "Who struggled most, and why?", "Which strong answers could I share in class?"];

type Turn = { question: string; answer: string; labels: Record<string, string>; state: "answering" | "done" | "failed"; error?: string };

/**
 * "Ask about this assignment": the teacher's questions, answered from the
 * class's conversations as they're written. The questions stay in the page;
 * each one sends the earlier ones back so a follow-up makes sense.
 */
export function AskPanel({
  activityId,
  attemptsBase,
  names,
}: {
  activityId: string;
  /** `/courses/…/grading/attempts`, to link each student cited. */
  attemptsBase: string;
  /** Attempt to name, only when the teacher shows names; otherwise empty. */
  names: Record<string, string>;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const abort = useRef<AbortController | null>(null);
  const busy = turns.at(-1)?.state === "answering";

  useEffect(() => () => abort.current?.abort(), []);

  const update = (patch: (t: Turn) => Turn) => setTurns((all) => [...all.slice(0, -1), patch(all[all.length - 1])]);

  async function ask(question: string) {
    const q = question.trim();
    if (q === "" || busy) return;
    const history = turns.filter((t) => t.state === "done").map((t) => ({ question: t.question, answer: t.answer }));
    setTurns((all) => [...all, { question: q, answer: "", labels: {}, state: "answering" }]);
    setDraft("");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch(`/api/insights/${activityId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, history }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const { reason } = (await response.json().catch(() => ({}))) as { reason?: string };
        update((t) => ({ ...t, state: "failed", error: reason ?? "The AI didn't answer. Ask again in a minute." }));
        return;
      }
      for await (const event of readAskEvents(response.body)) {
        if (event.type === "labels") update((t) => ({ ...t, labels: event.labels }));
        else if (event.type === "text") update((t) => ({ ...t, answer: t.answer + event.text }));
        else if (event.type === "done") update((t) => ({ ...t, state: "done" }));
        else update((t) => ({ ...t, state: "failed", error: event.reason }));
      }
    } catch {
      if (!controller.signal.aborted) update((t) => ({ ...t, state: "failed", error: "The connection dropped. Ask again." }));
    }
  }

  return (
    <section aria-labelledby="ask-title" className="flex flex-col gap-4 rounded-panel border border-border bg-surface px-5 py-4">
      <div className="flex flex-col gap-0.5">
        <h3 id="ask-title" className="text-xl font-bold">
          Ask about this assignment
        </h3>
        <p className="text-sm text-muted">Answers come only from the finished conversations, and name the students they&apos;re about.</p>
      </div>

      {turns.length > 0 && (
        <ol className="flex flex-col gap-4" aria-live="polite">
          {turns.map((t, i) => (
            <li key={i} className="flex flex-col gap-2">
              <p className="self-end rounded-panel bg-accent px-3 py-2 break-words text-white sm:max-w-[80%]">{t.question}</p>
              <div className="rounded-panel border border-border bg-subtle px-4 py-3 sm:max-w-[90%]">
                {t.answer ? (
                  <p className="break-words whitespace-pre-wrap">{cite(t.answer, t.labels, names, attemptsBase)}</p>
                ) : t.state === "answering" ? (
                  <p className="text-muted">Reading the conversations…</p>
                ) : null}
                {t.state === "failed" && (
                  <p role="alert" className="text-sm text-danger">
                    {t.error}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {turns.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="rounded-full border border-border-strong bg-surface px-3 py-1.5 text-sm text-accent-text hover:bg-accent-soft"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="sr-only">Your question</span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(draft);
              }
            }}
            rows={2}
            maxLength={1000}
            placeholder={turns.length > 0 ? "Ask a follow-up…" : "Ask anything about how the class did…"}
            className={`${inputStyles} resize-y`}
          />
        </label>
        <Button disabled={busy || draft.trim() === ""}>{busy ? "Answering…" : "Ask"}</Button>
      </form>
    </section>
  );
}

const CITE = /\[(S\d+(?:\s*,\s*S\d+)*)\]/g;

/** The answer with each [S3] (or [S3, S5]) as a link to that student's conversation. Exported for tests. */
export function cite(text: string, labels: Record<string, string>, names: Record<string, string>, attemptsBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(CITE)) {
    out.push(text.slice(last, m.index));
    const found = m[1].split(",").map((l) => l.trim());
    found.forEach((label, i) => {
      const attemptId = labels[label];
      const shown = attemptId && names[attemptId] ? names[attemptId] : `Student ${label.slice(1)}`;
      if (i > 0) out.push(", ");
      out.push(
        attemptId ? (
          <Link key={`${m.index}-${label}`} href={`${attemptsBase}/${attemptId}?from=insights`} className="font-medium text-accent-text hover:underline">
            {shown}
          </Link>
        ) : (
          shown
        ),
      );
    });
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}
