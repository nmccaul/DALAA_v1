"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui";
import { wizardTypeAction, type TypeState } from "../actions";
import { PickerField } from "../forms";

export type TypeCard = { slug: string; label: string; description: string; reason: string | null };

/**
 * Step 3: the suggested types as cards (the first marked Suggested), every
 * other type under "More types". Next drafts the activity; a failed draft
 * comes back with the choice still picked.
 */
export function TypePickForm({
  courseId,
  creationKey,
  addToCanvas,
  carried,
  suggested,
  others,
  reasonFields,
  back,
}: {
  courseId: string;
  creationKey: string;
  addToCanvas: string | null;
  /** Steps 1–2's answers as hidden fields (content, guide, goal, minutes). */
  carried: { name: string; value: string }[];
  suggested: TypeCard[];
  others: TypeCard[];
  /** A suggested card's reason as a hidden field, sent only for the card picked (the action reads the one matching). */
  reasonFields: { name: string; value: string }[];
  back: string;
}) {
  const [state, action, pending] = useActionState<TypeState, FormData>(wizardTypeAction, {});
  const picked = state.mode ?? suggested[0]?.slug;

  if (pending) {
    return (
      <section role="status" className="flex flex-col gap-2 rounded-panel border border-border bg-surface p-6">
        <h3 className="font-display text-lg font-semibold">DALAA is drafting your chat…</h3>
        <p className="text-muted">
          It&apos;s reading your materials and writing the scenario, character, ending and rubric around your goal. This takes up
          to a minute.
        </p>
      </section>
    );
  }

  const card = (c: TypeCard, label?: string) => (
    <li key={c.slug}>
      <label className="flex h-full cursor-pointer items-start gap-3 rounded-panel border border-border bg-surface p-4 transition-colors hover:border-border-strong has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
        <input type="radio" name="mode" value={c.slug} defaultChecked={c.slug === picked} required className="mt-1 shrink-0" />
        <span className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2 font-bold">
            {c.label}
            {label && <span className="rounded-control bg-accent px-2 py-0.5 text-xs font-bold text-white">{label}</span>}
          </span>
          <span className="text-sm text-muted">{c.description}</span>
          {c.reason && <span className="text-sm text-text">{c.reason}</span>}
        </span>
      </label>
    </li>
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="creationKey" value={creationKey} />
      <PickerField addToCanvas={addToCanvas} />
      {[...carried, ...reasonFields].map((f) => (
        <input key={f.name} type="hidden" name={f.name} value={f.value} />
      ))}

      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Activity type</legend>
        <ul className="grid grid-cols-1 gap-3">{suggested.map((c, i) => card(c, i === 0 ? "Suggested" : undefined))}</ul>
        {others.length > 0 && (
          <details open={others.some((c) => c.slug === picked)} className="flex flex-col gap-3">
            <summary className="cursor-pointer text-sm font-bold text-accent-text">More types</summary>
            <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{others.map((c) => card(c))}</ul>
          </details>
        )}
      </fieldset>

      <p className="text-sm text-muted">The type can&apos;t be changed once students start.</p>
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
        <Button type="submit">Next</Button>
      </div>
    </form>
  );
}
