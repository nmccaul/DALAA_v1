"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, inputStyles } from "@/components/ui";
import { wizardTypeAction, type TypeState } from "../actions";
import { PickerField } from "../forms";
import type { ModeSlug } from "../modes";
import { MINUTES, type Minutes } from "./query";
import { reasonField } from "./type-request";
import { groupOf, styleLabel, TYPE_GROUPS, type TypeGroup } from "./types";

/**
 * Step 2: the learning goal and the kind of activity, one decision (Nathan,
 * 2026-11-13). Both open on the AI's suggestion from the reading; the
 * suggested kind leads, marked as such, and every other kind is one click
 * away. A kind with more than one style asks which. Next drafts the chat;
 * a failed draft comes back with the choices kept.
 */
export function GoalTypeForm({
  courseId,
  creationKey,
  addToCanvas,
  carried,
  goal,
  goalSuggested,
  minutes,
  suggested,
  back,
}: {
  courseId: string;
  creationKey: string;
  addToCanvas: string | null;
  /** Step 1's picks as hidden fields (content, guide). */
  carried: { name: string; value: string }[];
  goal: string;
  /** False when the AI gave no goal: the teacher writes one. */
  goalSuggested: boolean;
  minutes: Minutes | null;
  /** The AI's types, best first, with why they fit (never empty). */
  suggested: { mode: ModeSlug; reason: string | null }[];
  back: string;
}) {
  const [state, action, pending] = useActionState<TypeState, FormData>(wizardTypeAction, {});
  const first = suggested[0].mode;
  const kept = TYPE_GROUPS.flatMap((g) => g.modes).find((m) => m === state.mode);
  const [group, setGroup] = useState(groupOf(kept ?? first).key);
  // Each group's style: the suggested one where the AI picked from it, else the usual one.
  const [styles, setStyles] = useState<Record<string, ModeSlug>>(() =>
    Object.fromEntries(
      TYPE_GROUPS.map((g) => [g.key, (kept && g.modes.includes(kept) ? kept : suggested.find((s) => g.modes.includes(s.mode))?.mode) ?? g.modes[0]]),
    ),
  );
  const mode = styles[group];
  const reasonOf = (g: TypeGroup) => suggested.find((s) => g.modes.includes(s.mode))?.reason ?? null;
  const lead = groupOf(first);
  const others = TYPE_GROUPS.filter((g) => g.key !== lead.key);

  if (pending) {
    return (
      <section role="status" className="flex flex-col gap-2 rounded-panel border border-border bg-surface p-6">
        <h3 className="font-display text-lg font-semibold">DALAA is drafting your chat…</h3>
        <p className="text-muted">
          It&apos;s reading your materials and writing the AI&apos;s role, the opening, the grading and when the chat ends, around your
          goal. This takes up to a minute.
        </p>
      </section>
    );
  }

  const option = (g: TypeGroup, leading: boolean) => {
    const checked = g.key === group;
    const reason = reasonOf(g);
    return (
      <li key={g.key}>
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-panel border bg-surface transition-colors hover:border-border-strong has-[:checked]:border-accent has-[:checked]:bg-accent-soft ${
            leading ? "p-4" : "px-4 py-3"
          } border-border`}
        >
          <input type="radio" name="group" value={g.key} checked={checked} onChange={() => setGroup(g.key)} className="mt-1 shrink-0" />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2 font-bold">
              {g.label}
              {leading && (
                <span className="rounded-control bg-accent px-2 py-0.5 text-xs font-bold text-white">Suggested based on your reading</span>
              )}
            </span>
            <span className="text-sm text-muted">{g.does}</span>
            {reason && (leading || checked) && <span className="text-sm text-text">{reason}</span>}
            {g.modes.length > 1 && checked && (
              <span className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">Style:</span>
                {g.modes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setStyles((s) => ({ ...s, [g.key]: m }));
                    }}
                    aria-pressed={styles[g.key] === m}
                    className={`rounded-full border px-3 py-0.5 ${
                      styles[g.key] === m ? "border-accent bg-accent text-white" : "border-border-strong bg-surface text-accent-text hover:bg-subtle"
                    }`}
                  >
                    {styleLabel(m)}
                  </button>
                ))}
              </span>
            )}
          </span>
        </label>
      </li>
    );
  };

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="creationKey" value={creationKey} />
      <PickerField addToCanvas={addToCanvas} />
      {carried.map((f) => (
        <input key={f.name} type="hidden" name={f.name} value={f.value} />
      ))}
      <input type="hidden" name="mode" value={mode} />
      {suggested.map((s) => s.reason && s.mode === mode && <input key={s.mode} type="hidden" name={reasonField(s.mode)} value={s.reason} />)}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="goal" className="font-bold">
          When students finish, they should be able to…
        </label>
        <textarea id="goal" name="goal" rows={3} required maxLength={1000} defaultValue={goal} className={inputStyles} />
        <p className="text-sm text-muted">
          {goalSuggested ? "Suggested based on your reading. Edit it until it says what you want." : "Write it in a sentence or two."}
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-bold">What will students do in the chat?</legend>
        <ul className="flex flex-col gap-3">{option(lead, true)}</ul>
        <details open={group !== lead.key} className="flex flex-col gap-2">
          <summary className="cursor-pointer text-sm font-bold text-accent-text">Other kinds of activity</summary>
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">{others.map((g) => option(g, false))}</ul>
        </details>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="minutes" className="font-bold">
          About how long?
        </label>
        <select id="minutes" name="minutes" defaultValue={minutes ?? "10-15"} className={`${inputStyles} sm:max-w-xs`}>
          {MINUTES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted">DALAA sizes the chat to fit. You can set exact limits in Chat options.</p>
      </div>

      {state.error && (
        <p role="alert" className="text-danger">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Link href={back} className="text-sm text-muted hover:text-text">
          ← Back
        </Link>
        <span className="flex-1" />
        <Button type="submit">Draft the chat</Button>
      </div>
    </form>
  );
}
