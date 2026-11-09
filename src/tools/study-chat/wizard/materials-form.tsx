"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SeenByPill, type SeenBy } from "@/components/seen-by-pill";
import { Button } from "@/components/ui";
import { wizardMaterialsAction, type MaterialsPickState } from "../actions";
import { PickerField } from "../forms";

export type PickRow = { value: string; name: string; source: string; seenBy: SeenBy; checked: boolean };

/** Step 1: tick what the activity uses. Next saves any ticked Canvas items and goes on to the learning goal. */
export function MaterialsPickForm({
  courseId,
  formKey,
  addToCanvas,
  rows,
  back,
}: {
  courseId: string;
  formKey: string;
  addToCanvas: string | null;
  rows: PickRow[];
  back: string;
}) {
  const [state, action, pending] = useActionState<MaterialsPickState, FormData>(wizardMaterialsAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="formKey" value={formKey} />
      <PickerField addToCanvas={addToCanvas} />
      <fieldset className="flex flex-col">
        <legend className="sr-only">Materials</legend>
        {rows.map((r) => (
          <label key={r.value} className="flex items-start gap-3 border-b border-border px-1 py-3 hover:bg-subtle">
            <input type="checkbox" name="pick" value={r.value} defaultChecked={state.ticked ? state.ticked.includes(r.value) : r.checked} className="mt-1 size-4 accent-[var(--color-accent)]" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-bold break-words">{r.name}</span>
              <span className="text-[13px] text-muted">{r.source}</span>
            </span>
            <SeenByPill seenBy={r.seenBy} />
          </label>
        ))}
      </fieldset>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}{" "}
          {state.reconnect && (
            <Link href={state.reconnect} className="underline">
              Reconnect Canvas
            </Link>
          )}
        </p>
      )}
      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Link href={back} className="text-sm text-muted hover:text-text">
          ← Back
        </Link>
        <span className="flex-1" />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Next"}
        </Button>
      </div>
    </form>
  );
}
